/**
 * Bobsled Security Test Suite - Core Test Harness & Runner
 * High-performance, standalone test execution engine with ANSI formatting.
 */

import { performance } from 'node:perf_hooks';

class TestHarness {
  constructor() {
    this.suites = [];
    this.currentSuite = null;
    this.stats = {
      totalSuites: 0,
      totalTests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      startTime: 0,
      endTime: 0,
    };
    this.failures = [];
  }

  describe(suiteName, fn) {
    const suite = {
      name: suiteName,
      tests: [],
      beforeEachHooks: [],
      afterEachHooks: [],
    };
    this.suites.push(suite);
    const prevSuite = this.currentSuite;
    this.currentSuite = suite;
    try {
      fn();
    } finally {
      this.currentSuite = prevSuite;
    }
  }

  beforeEach(fn) {
    if (this.currentSuite) {
      this.currentSuite.beforeEachHooks.push(fn);
    }
  }

  afterEach(fn) {
    if (this.currentSuite) {
      this.currentSuite.afterEachHooks.push(fn);
    }
  }

  it(testName, fn, options = {}) {
    if (!this.currentSuite) {
      throw new Error(`Test "${testName}" must be defined inside a describe() block`);
    }
    this.currentSuite.tests.push({
      name: testName,
      fn,
      skip: options.skip || false,
    });
  }

  async run() {
    this.stats.startTime = performance.now();
    this.stats.totalSuites = this.suites.length;
    this.stats.totalTests = this.suites.reduce((sum, s) => sum + s.tests.length, 0);

    console.log('\n' + '='.repeat(80));
    console.log('  🛡️   BOBSLED SECURITY AUDIT & HARDENING - E2E TEST RUNNER');
    console.log('='.repeat(80));
    console.log(`  Executing ${this.stats.totalTests} security test cases across ${this.stats.totalSuites} suites...\n`);

    for (const suite of this.suites) {
      console.log(`\n \x1b[1m\x1b[36m▶ Suite: ${suite.name}\x1b[0m`);

      for (const test of suite.tests) {
        if (test.skip) {
          this.stats.skipped++;
          console.log(`    \x1b[33m- [SKIP] ${test.name}\x1b[0m`);
          continue;
        }

        // Run beforeEach hooks
        for (const hook of suite.beforeEachHooks) {
          await hook();
        }

        const testStart = performance.now();
        try {
          await test.fn();
          const duration = (performance.now() - testStart).toFixed(2);
          this.stats.passed++;
          console.log(`    \x1b[32m✔ [PASS]\x1b[0m \x1b[90m(${duration}ms)\x1b[0m ${test.name}`);
        } catch (error) {
          const duration = (performance.now() - testStart).toFixed(2);
          this.stats.failed++;
          console.log(`    \x1b[31m✖ [FAIL]\x1b[0m \x1b[90m(${duration}ms)\x1b[0m ${test.name}`);
          console.log(`      \x1b[31mError: ${error.message}\x1b[0m`);
          this.failures.push({
            suite: suite.name,
            test: test.name,
            error,
          });
        }

        // Run afterEach hooks
        for (const hook of suite.afterEachHooks) {
          await hook();
        }
      }
    }

    this.stats.endTime = performance.now();
    this.printSummary();
    return this.stats.failed === 0;
  }

  printSummary() {
    const totalDuration = ((this.stats.endTime - this.stats.startTime) / 1000).toFixed(3);
    console.log('\n' + '='.repeat(80));
    console.log('  📊  SECURITY TEST EXECUTION SUMMARY');
    console.log('='.repeat(80));
    console.log(`  Suites:       ${this.stats.totalSuites}`);
    console.log(`  Total Tests:  ${this.stats.totalTests}`);
    console.log(`  \x1b[32mPassed:\x1b[0m       ${this.stats.passed}`);
    if (this.stats.failed > 0) {
      console.log(`  \x1b[31mFailed:\x1b[0m       ${this.stats.failed}`);
    } else {
      console.log(`  Failed:       0`);
    }
    if (this.stats.skipped > 0) {
      console.log(`  \x1b[33mSkipped:\x1b[0m      ${this.stats.skipped}`);
    }
    console.log(`  Duration:     ${totalDuration}s`);
    console.log('='.repeat(80));

    if (this.failures.length > 0) {
      console.log('\n  \x1b[31m\x1b[1mFAILURES DETAIL:\x1b[0m');
      this.failures.forEach((f, idx) => {
        console.log(`\n  ${idx + 1}) [${f.suite}] -> ${f.test}`);
        console.log(`     \x1b[31m${f.error.stack || f.error.message}\x1b[0m`);
      });
      console.log('\n' + '='.repeat(80));
    }
  }
}

export const harness = new TestHarness();
export const describe = (name, fn) => harness.describe(name, fn);
export const it = (name, fn, opts) => harness.it(name, fn, opts);
export const beforeEach = (fn) => harness.beforeEach(fn);
export const afterEach = (fn) => harness.afterEach(fn);

export const assert = {
  ok(val, msg = 'Expected value to be truthy') {
    if (!val) throw new Error(`${msg} (received: ${JSON.stringify(val)})`);
  },
  equal(actual, expected, msg) {
    if (actual !== expected) {
      throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  },
  deepEqual(actual, expected, msg) {
    const actStr = JSON.stringify(actual);
    const expStr = JSON.stringify(expected);
    if (actStr !== expStr) {
      throw new Error(msg || `Deep equality mismatch:\nExpected: ${expStr}\nActual:   ${actStr}`);
    }
  },
  includes(container, item, msg) {
    if (typeof container === 'string') {
      if (!container.includes(item)) {
        throw new Error(msg || `Expected string to contain "${item}"\nFull string: ${container}`);
      }
    } else if (Array.isArray(container) || container instanceof Set) {
      const has = Array.isArray(container) ? container.includes(item) : container.has(item);
      if (!has) {
        throw new Error(msg || `Expected collection to include ${JSON.stringify(item)}`);
      }
    } else {
      throw new Error(`Unsupported container type for includes: ${typeof container}`);
    }
  },
  match(str, regex, msg) {
    if (typeof str !== 'string' || !regex.test(str)) {
      throw new Error(msg || `Expected "${str}" to match regex ${regex}`);
    }
  },
  doesNotMatch(str, regex, msg) {
    if (typeof str === 'string' && regex.test(str)) {
      throw new Error(msg || `Expected "${str}" NOT to match regex ${regex}`);
    }
  },
  throws(fn, expectedErrOrMsg) {
    let threw = false;
    let err = null;
    try {
      fn();
    } catch (e) {
      threw = true;
      err = e;
    }
    if (!threw) {
      throw new Error('Expected function to throw an error, but it did not');
    }
    if (typeof expectedErrOrMsg === 'string') {
      if (!err.message.includes(expectedErrOrMsg)) {
        throw new Error(`Expected error message to include "${expectedErrOrMsg}", got "${err.message}"`);
      }
    } else if (expectedErrOrMsg instanceof RegExp) {
      if (!expectedErrOrMsg.test(err.message)) {
        throw new Error(`Expected error message to match ${expectedErrOrMsg}, got "${err.message}"`);
      }
    }
  },
  async rejects(asyncFn, expectedErrOrMsg) {
    let threw = false;
    let err = null;
    try {
      await asyncFn();
    } catch (e) {
      threw = true;
      err = e;
    }
    if (!threw) {
      throw new Error('Expected async operation to reject, but it resolved successfully');
    }
    if (typeof expectedErrOrMsg === 'string') {
      if (!err.message.includes(expectedErrOrMsg)) {
        throw new Error(`Expected rejection message to include "${expectedErrOrMsg}", got "${err.message}"`);
      }
    } else if (expectedErrOrMsg instanceof RegExp) {
      if (!expectedErrOrMsg.test(err.message)) {
        throw new Error(`Expected rejection message to match ${expectedErrOrMsg}, got "${err.message}"`);
      }
    }
  },
};
