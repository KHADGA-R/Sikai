import '@angular/compiler';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { signal, createEnvironmentInjector, runInInjectionContext } from '@angular/core';

const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const authUrl = moduleUrl('export class AuthService {}');
const contentUrl = moduleUrl('export class InstructorContentService {}');
const liveUrl = moduleUrl('export class LiveClassesService {}');
const { AuthService } = await import(authUrl);
const { InstructorContentService } = await import(contentUrl);
const { LiveClassesService } = await import(liveUrl);
const source = ts.transpileModule(readFileSync('src/app/features/instructor-dashboard.component.ts','utf8'), {
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,experimentalDecorators:true}
}).outputText.replace("'@angular/core'", JSON.stringify(import.meta.resolve('@angular/core')))
  .replace("'@angular/router'", JSON.stringify(import.meta.resolve('@angular/router')))
  .replace("'../core/auth.service'", JSON.stringify(authUrl))
  .replace("'../core/instructor-content.service'", JSON.stringify(contentUrl))
  .replace("'../core/live-classes.service'", JSON.stringify(liveUrl));
const { InstructorDashboardComponent } = await import(moduleUrl(source));
const now = Date.now();
const state = signal({teachers:[{id:'teacher',ownerId:'me'}, {id:'other',ownerId:'someone-else'}], slots:[
  {id:'future',teacherId:'teacher',start:now+1000,end:now+2000},
  {id:'past',teacherId:'teacher',start:now-2000,end:now-1000},
  {id:'ongoing',teacherId:'teacher',start:now-500,end:now+500},
  {id:'other',teacherId:'other',start:now+1000,end:now+2000}
],bookings:[
  {id:'future',slotId:'future',status:'confirmed'},
  {id:'past',slotId:'past',status:'confirmed'},
  {id:'ongoing',slotId:'ongoing',status:'confirmed'},
  {id:'cancelled',slotId:'future',status:'cancelled'},
  {id:'other',slotId:'other',status:'confirmed'}
]});
let fail = false;
const courses = [{id:'older',updatedAt:1,topics:[{lessons:[{},{}]}]}, {id:'newer',updatedAt:2,topics:[{lessons:[{}]}]}];
const injector = createEnvironmentInjector([
  {provide:AuthService,useValue:{user:()=>({id:'me',role:'instructor'})}},
  {provide:LiveClassesService,useValue:{state}},
  {provide:InstructorContentService,useValue:{list:async()=>{if(fail) throw new Error('Storage unavailable'); return courses;}}}
]);
const dashboard = runInInjectionContext(injector,()=>new InstructorDashboardComponent());
try {
  dashboard.now.set(now);
  assert.deepEqual(dashboard.upcoming().map(row=>row.booking.id), ['ongoing','future']);
  await dashboard.ngOnInit();
  assert.equal(dashboard.lessonCount(),3);
  assert.deepEqual(dashboard.recent().map(c=>c.id),['newer','older']);
  assert.equal(dashboard.loading(),false);
  dashboard.now.set(now+3000);
  assert.equal(dashboard.upcoming().length,0);
  fail=true;
  await dashboard.reload();
  assert.match(dashboard.error(),/Storage unavailable/);
  assert.equal(dashboard.loading(),false);
  fail=false;
  await dashboard.reload();
  assert.equal(dashboard.error(),'');
  state.set({teachers:[],slots:[],bookings:[]});
  assert.equal(dashboard.profile(),undefined);
  assert.deepEqual(dashboard.upcoming(),[]);
} finally { dashboard.ngOnDestroy(); injector.destroy(); }
console.log('Passed: instructor class ownership, cancelled/past exclusions, ongoing classes, time refresh, course/lesson activity, retry and missing-profile state.');
