const nodeRunnerVersion: string = process.versions.node;

function browserEvaluationContext(): string {
  return document.documentElement.dataset.testContext ?? window.location.pathname;
}

export { browserEvaluationContext, nodeRunnerVersion };
