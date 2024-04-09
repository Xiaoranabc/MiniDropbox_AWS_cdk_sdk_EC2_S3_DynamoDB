import { useState } from 'react'
import './App.css'
import {errorMessages} from './constants'
import { API } from 'aws-amplify';
import axios from 'axios'
import { withAuthenticator} from '@aws-amplify/ui-react';

const apiName = 'FileUploadApi';

function App() {
  const [textName, setTextName] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [objectKey, setObjectKey] = useState('');
  const [uploadURL, setUploadURL] = useState('');
  const [status, setStatus] = useState();


  function onDrop() {
    API.get(apiName, '/', {
      queryStringParameters: {
        'fileName': btoa(file.name),
        'textName': btoa(textName),
      }
    })
    .then((response) => {
      setObjectKey(response.key);
      setUploadURL(response.uploadURL);
      axios.put(response.uploadURL, file, {
        headers: {
          'content-type': file.type
        }
      }).then((response) => {
        setStatus(response.status);
      }).catch((error) => {
        setStatus(error.status);
        setError(error);
        console.error(error);
      });
    })
    .catch((error) => {
      setError(error);
      console.error(error);
    });
  };

  function formValidation() {
    let newErrors = [];
    if(!textName || textName === '') {
      newErrors.push(errorMessages['missText']);
    }
    if(!file || file === null) {
      newErrors.push(errorMessages['missFile']);
    }
    setError(newErrors);
    if(error.length === 0) {
      onDrop();
    }
  }


  return (
    <>
     <div className= 'upload-page'>
        <p className='error'>{error}</p>
        <label className='text-label'>Text input:
            <input className='text-input' onChange={(e)=> {setTextName(e.target.value)}}></input>
        </label>
        <label className='file-label'>File input: 
            <input className='file-input' type='file' name='file' onChange={(e) => setFile(e.target.files[0])}></input>
        </label>
        <button onClick={()=> formValidation()}>Submit</button>
        <p>{status === 200 ? 'Your file is uploaded successfully' : ''}</p>
     </div>
    </>
  )
}

export default withAuthenticator(App);
