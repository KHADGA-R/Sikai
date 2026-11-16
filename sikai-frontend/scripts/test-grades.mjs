import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('src/app/core/grades.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const { GRADE_GROUPS, matchesSchoolGrade, validGrade } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

assert.deepEqual(GRADE_GROUPS.flatMap(group => group.grades), Array.from({ length: 12 }, (_, i) => i + 1));
const maths = { category: 'K–12 Maths', grade: 6 };
assert.equal(matchesSchoolGrade(maths, 6), true);
assert.equal(matchesSchoolGrade(maths, 7), false);
assert.equal(matchesSchoolGrade(maths, 'All'), true);
assert.equal(matchesSchoolGrade({ category: 'Music', grade: 6 }, 6), false);
assert.equal(matchesSchoolGrade({ category: 'SEE Preparation', grade: 10 }, 10), true);
assert.equal(matchesSchoolGrade({ category: 'SEE Preparation' }, 10), false);
assert.equal(matchesSchoolGrade({ category: 'SEE Preparation' }, 'All'), true);
assert.equal(validGrade(undefined), true);
for (const grade of [1, 10, 12]) assert.equal(validGrade(grade), true);
for (const grade of [0, 13, -1, 1.5, NaN, Infinity, '10', null]) assert.equal(validGrade(grade), false);
console.log('Grade browsing checks passed.');
