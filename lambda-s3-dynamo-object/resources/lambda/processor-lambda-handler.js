import { nanoid } from 'nanoid';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutItemCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';

const s3_client = new S3Client({
  region: 'us-east-1',
});
const dynamo_client = new DynamoDBClient({
  region: 'us-east-1',
});

export const handler = async function (event) {
  const s3Key = Buffer.from(event.queryStringParameters.fileName, 'base64').toString();
  const textName = Buffer.from(event.queryStringParameters.textName, 'base64').toString();

  const uploadURL = await getUploadURL(s3Key);
  await writeToDynamodb(nanoid(), textName, `${process.env.UPLOAD_BUCKET}/${s3Key}`);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Headers': 'Authorization, *',
      'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'OPTIONS,GET',
    },
    body: JSON.stringify(uploadURL),
  };
};

const getUploadURL = async function(s3Key) {
  // Get signed URL from S3
  const putObjectParams = {
    Bucket: process.env.UPLOAD_BUCKET,
    Key: s3Key,
  };
  const command = new PutObjectCommand(putObjectParams);

  const signedUrl = await getSignedUrl(s3_client, command, { expiresIn: parseInt(process.env.URL_EXPIRATION_SECONDS || '300') });

  return {
    uploadURL: signedUrl,
    key: s3Key,
  };
}

const writeToDynamodb = async function(id, input_text, input_file_path) {
  const input = {
    "Item": {
      "id": {
        "S": id
      },
      "input_text": {
        "S": input_text
      },
      "input_file_path": {
        "S": input_file_path
      }
    },
    "TableName": process.env.FILE_TABLE
  };
  const command = new PutItemCommand(input);
  const response = await dynamo_client.send(command);
  return response
}

