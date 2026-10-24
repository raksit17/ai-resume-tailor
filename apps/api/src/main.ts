import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {Module,Inject,Controller,Get,Post,Param,Body,Query,Res,UploadedFile,UseInterceptors,Catch,ExceptionFilter,ArgumentsHost,HttpException} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {json,Response,Request,NextFunction} from 'express';
import {timingSafeEqual} from 'node:crypto';
import {ZodError} from 'zod';
import {Store} from './service';
@Catch()
class Errors implements ExceptionFilter{catch(e:any,host:ArgumentsHost){const res=host.switchToHttp().getResponse<Response>();const code=e instanceof HttpException?e.getStatus():e instanceof ZodError?400:500;res.status(code).json({message:e instanceof ZodError?e.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '):e.message||'Request failed'});}}
@Controller('v1')
class API{
 constructor(@Inject(Store) private readonly store:Store){}
 @Get('health')health(){return {ok:true,service:'Local AI Resume Tailor'}}
 @Get('state')async state(){return {profiles:await this.store.list('profile'),templates:await this.store.list('template'),jobs:await this.store.list('job'),resumes:await this.store.list('resume'),evidence:await this.store.list('evidence'),applications:await this.store.list('application'),imports:(await this.store.list('import')).map(r=>{const data=r.data as any;return {...r,data:{profile:data.profile,templateId:data.templateId,assetId:data.assetId,warnings:data.warnings||[],diagnostics:data.diagnostics||{}}};}),tasks:await this.store.db.task.findMany({orderBy:{createdAt:'desc'},take:50})};}
 @Post('assets')@UseInterceptors(FileInterceptor('file',{limits:{fileSize:15*1024*1024,files:1}}))upload(@UploadedFile()f:Express.Multer.File){return this.store.upload(f)}
 @Get('assets/:id')async asset(@Param('id')id:string,@Res()res:Response){const f=await this.store.bytes(id);res.setHeader('Content-Type',f.mime);res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`);res.send(f.buffer)}
 @Post('resumes/import')import(@Body()b:unknown){return this.store.queueImport(b)}
 @Post('profiles/master')profile(@Body()b:unknown){return this.store.confirmProfile(b)}
 @Post('templates')template(@Body()b:unknown){return this.store.template(b)}
 @Post('jobs/analyze')job(@Body()b:unknown){return this.store.queueJob(b)}
 @Post('resumes/tailor')tailor(@Body()b:unknown){return this.store.queueTailor(b)}
 @Post('resumes/:id/revise')revise(@Param('id')id:string,@Body()b:unknown){return this.store.revise(id,b)}
 @Post('resumes/:id/approve')approve(@Param('id')id:string,@Body()b:unknown){return this.store.approve(id,b)}
 @Post('resumes/:id/export')export(@Param('id')id:string,@Body()b:unknown){return this.store.export(id,b)}
 @Get('resumes/:id/preview')preview(@Param('id')id:string){return this.store.preview(id)}
 @Post('resumes/:id/compare')async compare(@Param('id')id:string){await this.store.get(id,'resume');return this.store.enqueue('compare',{resumeId:id})}
 @Get('tasks/:id')task(@Param('id')id:string){return this.store.task(id)}
 @Post('tasks/:id/retry')retry(@Param('id')id:string){return this.store.retry(id)}
 @Get('integrations/job-watcher')watcher(@Query()q:Record<string,string>){return this.store.watcherList(q)}
 @Post('integrations/job-watcher/import')watcherImport(@Body()b:unknown){return this.store.watcherImport(b)}
 @Post('integrations/job-watcher/tailor')watcherTailor(@Body()b:unknown){return this.store.watcherTailor(b)}
 @Post('integrations/github')github(@Body()b:unknown){return this.store.github(b)}
 @Post('applications')application(@Body()b:unknown){return this.store.application(b)}
}
@Module({controllers:[API],providers:[Store]})class App{}
async function main(){
 const token=process.env.API_TOKEN;if(!token||token.length<24)throw new Error('API_TOKEN must be set to at least 24 characters. Run scripts/setup.ps1 or scripts/setup.sh');
 const app=await NestFactory.create(App,{bodyParser:false});app.use(json({limit:'2mb'}));
 app.use((req:Request,res:Response,next:NextFunction)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');if(req.path==='/v1/health')return next();const supplied=Buffer.from(req.headers.authorization?.replace(/^Bearer /,'')||'');const expected=Buffer.from(token);if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return res.status(401).json({message:'Invalid API token'});next();});
 app.useGlobalFilters(new Errors());app.enableShutdownHooks();await app.listen(Number(process.env.PORT||3010),'0.0.0.0');
}void main();
