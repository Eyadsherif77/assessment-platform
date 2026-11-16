import assert from 'node:assert';
import { ReferenceImportService } from '../dist/services/referenceImportService.js';

console.log('Testing ReferenceImportService.detectUnitNumber()...');

const testCases = [
  { inputs: ['Unit 1', 'Model 1'], expected: 1 },
  { inputs: ['الوحدة الأولى', 'امتحان علوم'], expected: 1 },
  { inputs: ['unit 2', ''], expected: 2 },
  { inputs: ['الوحدة الثانية'], expected: 2 },
  { inputs: ['Unit-3', 'Sheet 1'], expected: 3 },
  { inputs: ['الوحدة الثالثة'], expected: 3 },
  { inputs: ['u4'], expected: 4 },
  { inputs: ['الوحدة الرابعة'], expected: 4 },
  { inputs: ['ch 5'], expected: 5 },
  { inputs: ['الوحدة الخامسة'], expected: 5 },
  { inputs: ['Model 1 unit 1'], expected: 1 },
  { inputs: ['Science_Prep3_Unit2.xlsx', 'Sheet1'], expected: 2 },
  { inputs: ['Unknown text', 'another random'], expected: null },
];

for (const tc of testCases) {
  const result = ReferenceImportService.detectUnitNumber(tc.inputs);
  assert.strictEqual(
    result,
    tc.expected,
    `Failed for inputs: ${JSON.stringify(tc.inputs)} -> expected ${tc.expected}, got ${result}`
  );
  console.log(`  [PASS] ${JSON.stringify(tc.inputs)} -> ${result}`);
}

console.log('\nAll unit detection tests passed!');

