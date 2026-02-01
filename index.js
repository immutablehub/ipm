#!/usr/bin/env node
import path from "path";
import os from "os";
import { PinataSDK } from "pinata";
import { provideClient }  from "./dbconnection.js"
import { create,extract } from 'tar'
import fs from "fs"
import process from "process";
import { algoliasearch } from "algoliasearch";
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const IHUB_DIR = path.join(os.homedir(), ".ihub");
const FILE_TO_STORE_LOGIN = path.join(IHUB_DIR, "login.txt");
const aclient = algoliasearch('', '');




async function getcreds() {

  let request=await fetch("https://immutablehub-creds.hf.space/creds",{
    mode:"cors",
    method:"get",
    headers:{
      "content-type":"application/json"
    }
  })
  let response=await request.json()
  return {"jwt":response.jwt,"gateway":response.gateway}
  
}



async function getRuntime() {

  const { jwt, gateway } = await getcreds();
  const pinata = new PinataSDK({ pinataJwt: jwt, pinataGateway: gateway });

 
  const client = provideClient();
  //let db=client.db("ihub")
  //let coll=db.collection("ih")
  //let dc=coll.c
  return { pinata, client };
  
}


function Setup(wallet){

    console.log("starting login > ")
    if (!fs.existsSync(IHUB_DIR)) {
            fs.mkdirSync(IHUB_DIR, { recursive: true });

    }

    if(fs.existsSync(FILE_TO_STORE_LOGIN)){
        console.log("already loggedin")
    }
    else {

        fs.writeFileSync(FILE_TO_STORE_LOGIN, wallet)
        console.log(`Successfully wrote wallet data to ${FILE_TO_STORE_LOGIN}`);

        
    }


}



async function packagezipper(packagename){
   


  const raw = fs.readFileSync("./package.json", "utf8");
  const readme=fs.readFileSync("./readme.md","utf-8");
  const pkg = JSON.parse(raw);

  const meta = {
    name: pkg.name,
    description: pkg.description,
    author: pkg.author,
    license: pkg.license,
    version: pkg.version,
    readme:readme
  };

    await create({  
      gzip:true,
      file: `${packagename}.tgz`,
      cwd: process.cwd(),
      filter: (path) => !path.includes("node_modules") && !path.endsWith('.tgz'),
    
    },
    ['.']
    )
      
    console.log("tarball has been created")
    let algolia_insertion=await  aclient.saveObject({
            indexName: 'ipm',
            body: meta
          });
    if(algolia_insertion.taskID){

      return meta
    }
    else {
      return {}
    }
    

}



function packageunzipper(packagename) {
  extract({
    gzip: true,
    file: packagename,   // example: mypkg.tgz
    cwd: "./ipm_modules",            // extract here
  });

  console.log("package extracted");
}



async function Publish(packagename,client,pinata) {


   try {

    let metadata=await packagezipper(packagename)
    console.log(metadata)
    let db = client.db("ihub_db");
    let coll = db.collection("ipm_protocol");
    const absolutePath = path.resolve(`${packagename}.tgz`);
    console.log(absolutePath)
    
    const buffer = fs.readFileSync(absolutePath);

    let filetoupload=new File([buffer], packagename,{type:"application/gzip"});

    const upload=await pinata.upload.public.file(filetoupload)
    console.log(upload)

    const data = fs.readFileSync(FILE_TO_STORE_LOGIN, 'utf8');
    let meta={
      "id":data,
      "foldername":packagename,
      "upload":upload,
      "is_latest":true,
      "metadata":metadata
    }

    await coll.insertOne(meta)

    
      console.log(meta)

          }catch(e){
            console.log(e)
          }
          finally{
            await client.close()
          }
}



async function Install(packagename,client,pinata){



    try {

        let db = client.db("ihub_db");
        let coll = db.collection("ipm_protocol");
        const data = fs.readFileSync(FILE_TO_STORE_LOGIN, 'utf8');
        let doc=await coll.findOne({"id":data,"foldername":packagename})

        //let upload=None
        let cid=""

        if(doc){
            
            cid=doc.upload.cid
        }
        

        const result = await pinata.gateways.public.get(cid)
        const Data = result.data;
        console.log(Data)
        const arrayBuffer = await Data.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer);
        console.log(buffer)
        let pkgpath=`${packagename}.tgz`
        fs.mkdirSync("ipm_modules")

        fs.writeFileSync(`ipm_modules/${pkgpath}`,buffer);
        packageunzipper(`ipm_modules/${pkgpath}`)
        console.log(`${packagename} installed successfully`)

    }catch(err){
        console.log(err)
    }
    finally{
      await client.close()
    }


    
}


yargs(hideBin(process.argv))
.command(
    'op',
    'interface for IPM',
    (yargs)=>{
        return yargs
        .command(
          'login <walletpublickey>',
          'Logs into ipm using a wallet address.',
          (yargs) => {
            return yargs.positional('walletpublickey', {
              describe: 'The wallet address to login with',
              type: 'string'
            });
          },
          (argv) => {
            Setup(argv.walletpublickey);
            console.log("Login successful.");
          }
        )
         .command(
          'publish <packagename>',
          'uploads your package to IPM',
          (yargs) => {
            return yargs.positional('packagename', {
              describe: 'The package to publish , generally a node js library',
              type: 'string'
            });
          },
          async (argv) => {
            const {pinata,client}=await getRuntime()
            await Publish(argv.packagename,client,pinata)

            console.log("package published");
          }
        ).command(
          'install <packagename>',
          'installs  given IPM package',
          (yargs) => {
            return yargs.positional('packagename', {
              describe: 'The package to install',
              type: 'string'
            });
          },
          async (argv) => {
            const {pinata,client}=await getRuntime()
            await Install(argv.packagename,client,pinata)
            console.log("package installed");
          }
        )
        
 
    }

)
 .demandCommand(1, 'You must provide a top-level command like "ihub".')
 .help("ipm op publish <packagename>","run this command in your node package dir which u want to publish as pkg")
 .help("ipm op install <packagename> ","command to install the pkg from ipm registry")
.argv
  


