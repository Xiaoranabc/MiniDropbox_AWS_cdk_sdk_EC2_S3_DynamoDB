# Project Overview
This project consists of two main parts: the front-end React application and the AWS CDK deployment.

# Front-end (React)
The React app creates a simple page with a form allowing users to input text and upload files to Amazon S3.

# AWS CDK Deployment
The AWS CDK deployment performs the following tasks:
- Sets up the stack and initializes various AWS resources.
- Configures an S3 bucket for file storage.
- Creates a DynamoDB table for storing metadata.
- Creates Lambda functions:
    - One function processes API Gateway requests.
    - Another function handles DynamoDB stream events.
- Configures an API Gateway.
- Sets up a Cognito User Pool for authentication.
- Creates an EC2 instance and configures necessary roles and policies.

# AWS SDK Handler
The AWS SDK handler performs the following actions:
- Generates a signed URL for uploading files to S3.
- Uploads the file to S3 and writes the file path to DynamoDB.
- Executes a bash script: 
    - Create a new attribute named output_file_path for the dynamoDB table.
    - append the text into file and upload the new file into S3 bucket.
    - Terminates the EC2 instance.

# How to run 
Clone the repository:
```bash
$ git clone <repository-url>
```

Install dependencies for Lambda and CDK:
```bash
$ cd lambda-s3-dynamo-object
$ npm install
$ cd resources/lambda
$ npm install
```

Deploy the AWS CDK stack:
```bash
$ cd ../..
$ aws sso login --profile <your-profile>
$ cdk deploy --profile <your-profile>
```

Navigate to the front-end directory and install dependencies:
```bash
$ cd ../front-end
$ npm install
```

Run the front-end development server:
```bash
$ npm run dev
```
Open the URL shown in your terminal.

If a Cognito prompt will ask you to sign in. Use the following instructions:
- Create a user with username and password. A valid password must at least 11 digits and contain a lower letter, an upper letter, a symbol character and numbers.
- After create a account, please go to aws console and search Cognito. Choose the userpool created by cdk - choose the username just created - click 'Action' - click 'Confirm account'
- Back to the front-end React, reload the web page back to sign in, enter your username and password

# References
[aws cdk example](https://github.com/aws-samples/aws-cdk-examples/tree/main/typescript/s3-object-lambda)

[presigned url api](https://github.com/jeromevdl/cdk-s3-upload-presignedurl-api/tree/main)

