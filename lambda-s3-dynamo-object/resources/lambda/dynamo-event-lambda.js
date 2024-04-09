
import { EC2Client, RunInstancesCommand } from "@aws-sdk/client-ec2"; 


const client = new EC2Client({region: 'us-east-1'});

export const handler = async function (event) {
    const records = event.Records;

    await Promise.all(
        records.map(async record => {
            if (record.eventName === 'INSERT') {
                const dbId = record.dynamodb.Keys.id.S;
                console.log(dbId);

                const bucket = process.env.UPLOAD_BUCKET;
                const tableName = process.env.FILE_TABLE;
                console.log(tableName);

                const script = `
                #!/bin/bash
                table_name="${tableName}"
                id="${dbId}"
                bucket_name="${bucket}"
                aws configure set region us-east-1
                sudo yum -y install jq
                items=$(aws dynamodb get-item --table-name "$table_name" --key '{"id": {"S": "'"$id"'"}}')
                input_text=$(jq -r '.Item | .input_text.S' <<< "$items")
                input_file_path=$(jq -r '.Item | .input_file_path.S' <<< "$items")
                input_file_name=$(echo "$input_file_path" | cut -d'/' -f2)
                output_file_name="output_$input_file_name"
                output_file_path="$bucket_name/$output_file_name"
                aws s3api get-object --bucket $bucket_name --key $input_file_name $output_file_name
                echo " : $input_text" >> "$output_file_name"
                aws s3 cp $output_file_name s3://$output_file_path
                aws dynamodb update-item \
                    --table-name "$table_name" \
                    --key '{"id": {"S": "'"$id"'"}}' \
                    --update-expression "SET output_file_path = :output_file_path" \
                    --expression-attribute-values '{":output_file_path": {"S": "'"$output_file_path"'"}}'
                instance_id=$(ec2-metadata --instance-id | cut -d' ' -f2)
                aws ec2 terminate-instances --instance-ids $instance_id
                `;

                const encodedScript = Buffer.from(script).toString('base64');
                
                const input = {
                    MaxCount: 1,
                    MinCount: 1,
                    UserData: encodedScript,
                    LaunchTemplate: {
                        LaunchTemplateId: process.env.LAUNCH_TEMPLATE_ID,
                        LaunchTemplateName: process.env.LAUNCH_TEMPLATE_NAME,
                        Version: process.env.LAUNCH_TEMPLATE_VERSION,
                    },
                }

                const command = new RunInstancesCommand(input);
                const response = await client.send(command).catch(err => console.log(err));
                console.log(response)  
            }
        })
    );

    return {
        statusCode: 200
    }
}
