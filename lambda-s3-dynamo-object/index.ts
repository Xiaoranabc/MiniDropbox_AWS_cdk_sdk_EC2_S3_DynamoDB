import { Stack, StackProps, CfnOutput, Duration } from 'aws-cdk-lib';
import {
  aws_iam as iam,
  aws_s3 as s3,
  aws_lambda as lambda,
} from 'aws-cdk-lib';
import { AccessLogFormat, AuthorizationType, Authorizer, CfnMethod, CognitoUserPoolsAuthorizer, Cors, EndpointType, LambdaIntegration, LogGroupLogDestination, MethodLoggingLevel, RestApi, RestApiProps } from 'aws-cdk-lib/aws-apigateway';
import { CfnUserPool, UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Bucket, HttpMethods } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Effect } from 'aws-cdk-lib/aws-iam';

export class S3ObjectLambdaStack extends Stack {
  public readonly bucket: Bucket;
  public readonly processorLambda: lambda.Function;
  public readonly table: dynamodb.Table;
  public readonly restApi: RestApi;
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;
  public readonly ec2Instance: ec2.Instance; 
  public readonly dynamoEventLambda: lambda.Function;

  
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.bucket = new s3.Bucket(this, 'upload-files-saving-bucket', {
      accessControl: s3.BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedMethods: [HttpMethods.HEAD, HttpMethods.GET, HttpMethods.PUT],
          allowedOrigins: ['*'],
          allowedHeaders: ['Authorization', '*'],
        },
      ],
    });

    this.table = new dynamodb.Table(this, 'FileTable', { 
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      stream: dynamodb.StreamViewType.KEYS_ONLY,
    });
  
    
    // lambda to process API gateway request
    this.processorLambda = new lambda.Function(this, 'processorLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'processor-lambda-handler.handler',
      code: lambda.Code.fromAsset('resources/lambda/'),
      environment: {
          UPLOAD_BUCKET: this.bucket.bucketName,
          FILE_TABLE: this.table.tableName,
          URL_EXPIRATION_SECONDS: '300',
          ALLOWED_ORIGIN: '*'
      },
      timeout: Duration.seconds(60),
      memorySize: 256,
    });
    this.bucket.grantPut(this.processorLambda);
    this.table.grantWriteData(this.processorLambda)

    const apiLogGroup = new LogGroup(this, 'FileUploadApiLogGroup', {
      retention: RetentionDays.ONE_WEEK,
    });

    let apiProps: RestApiProps = {
      description: 'API that retrieves a presigned URL to upload a file into S3',
      endpointTypes: [EndpointType.REGIONAL],
      deployOptions: {
        accessLogDestination: new LogGroupLogDestination(apiLogGroup),
        accessLogFormat: AccessLogFormat.jsonWithStandardFields(),
        loggingLevel: MethodLoggingLevel.INFO,
        metricsEnabled: true,
        tracingEnabled: true,
        dataTraceEnabled: false,
        stageName: 'prod',
      },
      defaultMethodOptions: {authorizationType: AuthorizationType.COGNITO},
    };

    this.restApi = new RestApi(this, 'FileUploadApi', apiProps);

    // Adding security on the API if needed
    var apiGatewayAuthorizer: Authorizer | any = undefined;

    this.userPool = new UserPool(this, 'CognitoUserPool', {
      selfSignUpEnabled: true,
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: true,
        requireDigits: true,
      },
    });
    this.userPoolClient = new UserPoolClient(this, 'CognitoUserPoolClient', {
      userPool: this.userPool,
    });
    const cfnUserPool = this.userPool.node.findChild('Resource') as CfnUserPool;
    cfnUserPool.userPoolAddOns = {
      advancedSecurityMode: 'ENFORCED',
    };

    new CfnOutput(this, 'User Pool Id', { value: this.userPool.userPoolId });
    new CfnOutput(this, 'User Pool Client Id', { value: this.userPoolClient.userPoolClientId });


    apiGatewayAuthorizer = new CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [this.userPool],
      identitySource: 'method.request.header.Authorization',
    });
    apiGatewayAuthorizer._attachToApi(this.restApi);


    // Adding GET method on the API
    this.restApi.root.addMethod('GET', new LambdaIntegration(this.processorLambda), {
      requestParameters: {
        'method.request.querystring.fileName': true,
        'method.request.querystring.textName': true,
      },
      requestValidatorOptions: {
        requestValidatorName: 'validate-request-param',
        validateRequestBody: false,
        validateRequestParameters: true,
      },
    });

    // CORS configuration for the API
    this.restApi.root.addCorsPreflight({
      allowHeaders: ['Authorization', '*'],
      allowOrigins: ['*'],
      allowMethods: ['OPTIONS', 'GET'],
      allowCredentials: true,
    });

    this.restApi.methods.forEach(method => {
      const cfnmethod = method.node.defaultChild as CfnMethod;
      if (method.httpMethod == 'OPTIONS') {
        cfnmethod.addPropertyOverride('AuthorizationType', 'NONE');
      } else {
        cfnmethod.addPropertyOverride('AuthorizationType', 'COGNITO_USER_POOLS');
        cfnmethod.addPropertyOverride('AuthorizerId', apiGatewayAuthorizer.authorizerId);
      }
    });

    const ec2Role = new iam.Role(this, 'ec2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2FullAccess'),
      ],
    });

    const launchTemplate = new ec2.LaunchTemplate(this, 'ec2LaunchTemplate', {
        role: ec2Role,
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T2,
          ec2.InstanceSize.MICRO,
        ),
        machineImage: new ec2.AmazonLinuxImage({generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2})
    });

    this.dynamoEventLambda = new lambda.Function(this, 'dynamoEventLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'dynamo-event-lambda.handler',
      code: lambda.Code.fromAsset('resources/lambda/'),
      environment: {
          UPLOAD_BUCKET: this.bucket.bucketName,
          FILE_TABLE: this.table.tableName,
          LAUNCH_TEMPLATE_ID: launchTemplate.launchTemplateId ?? '',
          LAUNCH_TEMPLATE_NAME: launchTemplate.launchTemplateName ?? '',
          LAUNCH_TEMPLATE_VERSION: launchTemplate.versionNumber
      },
      timeout: Duration.seconds(60),
      memorySize: 256,
    });

    this.dynamoEventLambda.addEventSource(new DynamoEventSource(this.table, {
      startingPosition: lambda.StartingPosition.LATEST,
    }));

    this.dynamoEventLambda.role?.attachInlinePolicy(new iam.Policy(this, 'ec2-start-stop-policy', {
      statements: [
        new iam.PolicyStatement({
          actions: [ "ec2:*"],
          resources: ['arn:aws:ec2:*'],
          effect: Effect.ALLOW,
        }),
        new iam.PolicyStatement({
          actions: [ "iam:PassRole"],
          resources: [ec2Role.roleArn],
          effect: Effect.ALLOW,
        }),
     ]
    }));
  }
}

const app = new cdk.App();
new S3ObjectLambdaStack(app, 'S3ObjectLambdaStack');
app.synth();