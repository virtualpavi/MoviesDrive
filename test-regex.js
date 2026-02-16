#!/usr/bin/env node

/**
 * Test script to debug regex patterns
 */

const permalink = '/landman-season-1/';
const season = 1;

console.log('Testing regex patterns:');
console.log(`Permalink: ${permalink}`);
console.log(`Season: ${season}`);

// Current pattern
const seasonPattern = new RegExp(`/season-${season}[/-]|/s${season}[/-]|/s0*${season}[/-]|/season-${season}$|/s${season}$|/s0*${season}$`, 'i');
console.log(`\nPattern: ${seasonPattern}`);
console.log(`Test result: ${seasonPattern.test(permalink)}`);

// Test individual parts
const parts = [
  `/season-${season}[/-]`,
  `/s${season}[/-]`,
  `/s0*${season}[/-]`,
  `/season-${season}$`,
  `/s${season}$`,
  `/s0*${season}$`
];

console.log('\nTesting individual parts:');
parts.forEach((part, i) => {
  const regex = new RegExp(part, 'i');
  console.log(`  Part ${i + 1}: ${part} -> ${regex.test(permalink)}`);
});

// Test simpler pattern
const simplePattern = new RegExp(`season-${season}`, 'i');
console.log(`\nSimple pattern: ${simplePattern} -> ${simplePattern.test(permalink)}`);

// Test with word boundaries
const boundaryPattern = new RegExp(`season-${season}\\b`, 'i');
console.log(`Boundary pattern: ${boundaryPattern} -> ${boundaryPattern.test(permalink)}`);