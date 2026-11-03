import { getNodeAutoInstrumentations } from './instrumentations';

/**
 * OpenTelemetry bootstrap. Only starts when OTEL_EXPORTER_OTLP_ENDPOINT is set, so local
 * development has zero tracing overhead. Must be imported before Nest modules load.
 */
export async function startTracing(): Promise<void> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;
  const { NodeSDK } = await import('@opentelemetry/sdk-node');
  const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'jandi-api',
    traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` }),
    instrumentations: await getNodeAutoInstrumentations(),
  });
  sdk.start();
  process.once('SIGTERM', () => void sdk.shutdown());
}
