import '@angular/compiler';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';

const compile = path => ts.transpileModule(readFileSync(path, 'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,experimentalDecorators:true}}).outputText;
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const authUrl = moduleUrl(compile('src/app/core/auth.service.ts').replace("'@angular/core'", JSON.stringify(import.meta.resolve('@angular/core'))));
const local = new Map(), session = new Map();
const storage = data => ({getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)});
globalThis.localStorage = storage(local);
globalThis.sessionStorage = storage(session);
const { AuthService } = await import(authUrl);
const auth = new AuthService();
await auth.register('Student', 'student@example.com', 'password123', 'student');
assert.equal(auth.user().role, 'student');
assert.equal(auth.isInstructor(), false);
const studentId = auth.user().id;
auth.logout();
await auth.register('Teacher', 'teacher@example.com', 'password123', 'instructor');
assert.equal(auth.isInstructor(), true);
const teacherId = auth.user().id;
assert.equal(new AuthService().user().role, 'instructor');
auth.logout();
await auth.login('student@example.com', 'password123');
assert.equal(auth.user().id, studentId);
assert.equal(auth.isInstructor(), false);
await assert.rejects(auth.register('Invalid', 'invalid@example.com', 'password123', 'admin'), /Choose Student or Instructor/);

const guardSource = compile('src/app/core/auth.guard.ts')
  .replace("'@angular/core'", JSON.stringify(import.meta.resolve('@angular/core')))
  .replace("'@angular/router'", JSON.stringify(import.meta.resolve('@angular/router')))
  .replace("'./auth.service'", JSON.stringify(authUrl));
const { instructorGuard } = await import(moduleUrl(guardSource));
const injector = createEnvironmentInjector([
  {provide:AuthService,useValue:auth},
  {provide:Router,useValue:{createUrlTree:(commands, extras)=>({commands, extras})}}
]);
const contentSource = compile('src/app/core/instructor-content.service.ts')
  .replace("'@angular/core'", JSON.stringify(import.meta.resolve('@angular/core')))
  .replace("'./auth.service'", JSON.stringify(authUrl))
  .replace("'./instructor-content'", JSON.stringify(moduleUrl('export function validateInstructorCourse() {}')));
const { InstructorContentService } = await import(moduleUrl(contentSource));
const content = runInInjectionContext(injector, () => new InstructorContentService());
await assert.rejects(content.list(), /Only instructors/);
await assert.rejects(content.save({ownerId:studentId}), /Only instructors/);
const guard = () => runInInjectionContext(injector,()=>instructorGuard({}, {url:'/instructor'}));
assert.deepEqual(guard().commands, ['/live-classes']);
auth.logout();
assert.deepEqual(guard(), {commands:['/login'],extras:{queryParams:{returnUrl:'/instructor'}}});
await auth.login('teacher@example.com', 'password123');
assert.equal(guard(), true);

// Upgrade role-less records and preserve existing live-class teachers.
const legacy = JSON.parse(local.get('learnhub.accounts')).map(({role, ...account})=>account);
local.set('learnhub.accounts', JSON.stringify(legacy));
local.set('sikai.live-classes.v1', JSON.stringify({teachers:[{ownerId:teacherId}]}));
session.set('learnhub.session', teacherId);
assert.equal(new AuthService().user().role, 'instructor');
session.set('learnhub.session', studentId);
assert.equal(new AuthService().user().role, 'student');
assert.ok(JSON.parse(local.get('learnhub.accounts')).every(a=>a.role));
// Once migrated, the explicit role wins over teacher records.
local.set('sikai.live-classes.v1', JSON.stringify({teachers:[{ownerId:studentId}]}));
assert.equal(new AuthService().user().role, 'student');
injector.destroy();
console.log('Passed: role registration, persistence, login, invalid roles, instructor guard, legacy teacher migration and student default.');
