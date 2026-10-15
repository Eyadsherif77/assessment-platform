// Offline Simulation to Compare Candidate-Buffer Strategies
// Compares token efficiency, first-pass success rate, and replenishment rates across 2,000 trials per strategy

function simulatePass1(requestCount, rejectionRate) {
  let passed = 0;
  for (let i = 0; i < requestCount; i++) {
    if (Math.random() >= rejectionRate) {
      passed++;
    }
  }
  return passed;
}

function runSimulation(strategy, trials = 2000, requiredCount = 5, rejectionRate = 0.45) {
  let pass1Successes = 0;
  let finalSuccesses = 0;
  let totalPass1Tokens = 0;
  let totalPass2Tokens = 0;
  let totalSolverTokens = 0;
  let totalPass2Calls = 0;

  // Base token estimates based on live production telemetry:
  // Base prompt: ~2,500 tokens
  // Per candidate generation: ~350 tokens
  // Per candidate blind-solver check: ~850 tokens
  const basePromptTokens = 2500;
  const tokensPerCandidate = 350;
  const tokensPerSolver = 850;

  for (let t = 0; t < trials; t++) {
    // 1. Pass 1
    const p1RequestCount = strategy.getPass1Count(requiredCount);
    totalPass1Tokens += basePromptTokens + (p1RequestCount * tokensPerCandidate);

    const p1Passed = simulatePass1(p1RequestCount, rejectionRate);
    // Solvers ran on prefiltered candidates (typically 75% of raw candidates)
    const p1CheckedWithSolver = Math.min(p1RequestCount, Math.ceil(p1RequestCount * 0.85));
    totalSolverTokens += p1CheckedWithSolver * tokensPerSolver;

    if (p1Passed >= requiredCount) {
      pass1Successes++;
      finalSuccesses++;
      continue;
    }

    // 2. Pass 2 needed
    totalPass2Calls++;
    const needed = requiredCount - p1Passed;
    const p2RequestCount = strategy.getPass2Count(needed);
    totalPass2Tokens += (basePromptTokens * 0.7) + (p2RequestCount * tokensPerCandidate);

    const p2Passed = simulatePass1(p2RequestCount, rejectionRate);
    totalSolverTokens += p2RequestCount * tokensPerSolver;

    if (p1Passed + p2Passed >= requiredCount) {
      finalSuccesses++;
    }
  }

  const avgTokensPerExam = (totalPass1Tokens + totalPass2Tokens + totalSolverTokens) / trials;
  const pass1Rate = (pass1Successes / trials) * 100;
  const finalRate = (finalSuccesses / trials) * 100;
  const pass2NeedRate = (totalPass2Calls / trials) * 100;

  return {
    strategyName: strategy.name,
    requiredCount,
    rejectionRate: `${rejectionRate * 100}%`,
    pass1Rate: `${pass1Rate.toFixed(1)}%`,
    finalSuccessRate: `${finalRate.toFixed(1)}%`,
    deficitRate: `${(100 - finalRate).toFixed(1)}%`,
    pass2NeedRate: `${pass2NeedRate.toFixed(1)}%`,
    avgTokensPerExam: Math.round(avgTokensPerExam)
  };
}

console.log('========================================================================');
console.log('OFFLINE EVALUATION: CANDIDATE BUFFER STRATEGIES (2,000 Trials each)');
console.log('========================================================================\n');

const currentStrategy = {
  name: 'Current Strategy (Pass 1 Buffer = 3, Pass 2 = needed + 2)',
  getPass1Count: (count) => Math.min(10, count + Math.max(3, Math.ceil(count * 0.6))), // 8 for count=5
  getPass2Count: (needed) => Math.min(6, needed + 2) // 3 for needed=1, 4 for needed=2
};

const optimizedStrategy = {
  name: 'Optimized Strategy (Pass 1 Buffer = 4, Pass 2 = needed * 2 + 1)',
  getPass1Count: (count) => Math.min(10, count + Math.min(5, Math.max(4, Math.ceil(count * 0.8)))), // 9 for count=5
  getPass2Count: (needed) => Math.min(8, Math.max(3, needed * 2 + 1)) // 3 for needed=1, 5 for needed=2
};

// Test at varying rejection rates (35%, 45%, 55%)
[0.35, 0.45, 0.55].forEach(rate => {
  console.log(`--- Rejection Rate: ${rate * 100}% ---`);
  const resCurrent = runSimulation(currentStrategy, 3000, 5, rate);
  const resOpt = runSimulation(optimizedStrategy, 3000, 5, rate);
  console.table([resCurrent, resOpt]);
  console.log('');
});
