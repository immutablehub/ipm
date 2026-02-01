import { MongoClient, ServerApiVersion } from 'mongodb';
const uri = ""; 

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});



function provideClient() {
    return client;
}

export {provideClient}
