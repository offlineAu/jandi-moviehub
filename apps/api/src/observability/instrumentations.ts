export async function getNodeAutoInstrumentations() {
  const { HttpInstrumentation } = await import('@opentelemetry/instrumentation-http');
  const { ExpressInstrumentation } = await import('@opentelemetry/instrumentation-express');
  return [new HttpInstrumentation(), new ExpressInstrumentation()];
}
