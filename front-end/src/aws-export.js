import { Auth } from 'aws-amplify';

const awsconfig =  {
  Auth: {
    region: 'us-east-1',
    userPoolId: 'us-east-1_bWJkQejOe',
    userPoolWebClientId: '4h3kqrmoprs8ghbjrmvffffo14',
  },
  API: {
    endpoints: [
      {
         name: 'FileUploadApi',
         endpoint: 'https://p03vdf7w1e.execute-api.us-east-1.amazonaws.com/prod/',
         custom_header: async () => {
           return { Authorization: `${(await Auth.currentSession()).getIdToken().getJwtToken()}` }
         }
      }
    ]
  }
};


export default awsconfig;