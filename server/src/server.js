import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
const app=express(); app.use(cors()); app.use(express.json());
const jobs=[
 {id:'job-1',title:'Frontend Developer Intern',company:'Northstar Labs',location:'Remote',type:'Internship',skills:['React','JavaScript','Accessibility'],match:88,trust:'verified',estimatedMinutes:45,description:'Build accessible product experiences with a small product team.'},
 {id:'job-2',title:'AI Application Engineer',company:'Cedar Systems',location:'Bengaluru',type:'Full-time',skills:['React','Node.js','Python'],match:82,trust:'demo',estimatedMinutes:90,description:'Prototype responsible AI-enabled workflows; synthetic demo listing.'},
 {id:'job-3',title:'Junior Data Analyst',company:'Bluebird Health',location:'Hybrid',type:'Full-time',skills:['SQL','Excel','Analytics'],match:64,trust:'caution',estimatedMinutes:60,description:'Turn operational data into clear reports. Review source details before applying.'},
 {id:'job-4',title:'Full-stack JavaScript Developer',company:'Openfield Co.',location:'Remote',type:'Full-time',skills:['React','Express','MongoDB'],match:79,trust:'verified',estimatedMinutes:75,description:'Ship reliable features across the web stack.'}
];
let saved=[{jobId:'job-1'}], applications=[];
const auth=(req,res,next)=>{const h=req.headers.authorization; if(!h)return res.status(401).json({error:'Authentication required'});try{req.user=jwt.verify(h.split(' ')[1],process.env.JWT_SECRET||'dev-secret');next()}catch{res.status(401).json({error:'Invalid token'})}};
app.get('/api/health',(req,res)=>res.json({ok:true,mode:'demo',mongodbReady:Boolean(process.env.MONGODB_URI)}));
app.post('/api/auth/demo',(req,res)=>res.json({token:jwt.sign({id:'demo-user',email:req.body?.email||'demo@example.com'},process.env.JWT_SECRET||'dev-secret'),user:{name:'Demo Candidate'}}));
app.get('/api/jobs',(req,res)=>res.json(jobs)); app.get('/api/saved',auth,(req,res)=>res.json(saved));
app.post('/api/saved/:id',auth,(req,res)=>{if(!jobs.some(j=>j.id===req.params.id))return res.status(404).json({error:'Job not found'});if(!saved.some(x=>x.jobId===req.params.id))saved.push({jobId:req.params.id});res.json({saved})});
app.delete('/api/saved/:id',auth,(req,res)=>{saved=saved.filter(x=>x.jobId!==req.params.id);res.json({saved})});
app.get('/api/applications',auth,(req,res)=>res.json(applications));
app.post('/api/applications',auth,(req,res)=>{if(!jobs.some(j=>j.id===req.body.jobId))return res.status(404).json({error:'Job not found'});let a={id:randomUUID(),userId:req.user.id,jobId:req.body.jobId,status:req.body.status||'Planned',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};applications.push(a);res.status(201).json(a)});
app.patch('/api/applications/:id',auth,(req,res)=>{let a=applications.find(x=>x.id===req.params.id&&x.userId===req.user.id);if(!a)return res.status(404).json({error:'Application not found'});a.status=req.body.status||a.status;a.updatedAt=new Date().toISOString();res.json(a)});
app.delete('/api/account',auth,(req,res)=>res.json({message:'Demo account deletion acknowledged; production adapter should delete MongoDB records and exports.'}));
app.listen(process.env.PORT||4000,()=>console.log(`CareerPilot API listening on ${process.env.PORT||4000}`));
