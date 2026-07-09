/**
 * Configuración del proveedor de IA y artefactos que produce.
 *
 * La aplicación es agnóstica al proveedor: el `AIService` consume
 * la interfaz `ChatMessage` y devuelve texto. Cada proveedor
 * implementa la llamada HTTP correspondiente.
 */

import { ID } from './common.model';

export type AIProviderId =
  | 'openai'
  | 'gemini'
  | 'claude'
  | 'openrouter'
  | 'ollama'
  | 'lmstudio'
  | 'vllm'
  | 'custom';

export interface AIProvider {
  id: AIProviderId;
  /** Nombre visible. */
  name: string;
  /** URL base del endpoint compatible con OpenAI (chat/completions). */
  baseUrl: string;
  /** Modelo a usar por defecto. */
  model: string;
  /** Indica si requiere API Key. */
  requiresApiKey: boolean;
  /** Lista de modelos sugeridos. */
  suggestedModels?: string[];
  /** Descripción para mostrar al usuario. */
  description: string;
}

export const AI_PROVIDERS: AIProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    requiresApiKey: true,
    suggestedModels: ['gpt-5.4-mini', 'gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    description: 'Proveedor comercial de OpenAI. Requiere API Key.'
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-1.5-flash',
    requiresApiKey: true,
    suggestedModels: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp'],
    description: 'Modelos Gemini de Google mediante endpoint compatible con OpenAI.'
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-sonnet-latest',
    requiresApiKey: true,
    suggestedModels: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'],
    description: 'Modelos Claude de Anthropic. Compatible con el Messages API.'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    requiresApiKey: true,
    suggestedModels: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-flash-1.5'],
    description: 'Pasarela a múltiples proveedores con una sola API Key.'
  },
  {
    id: 'ollama',
    name: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
    requiresApiKey: false,
    suggestedModels: ['llama3.2', 'qwen2.5', 'mistral', 'gemma2'],
    description: 'Modelos locales servidos por Ollama. Sin clave, sin envío de datos.'
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (local)',
    baseUrl: 'http://localhost:1234/v1',
    model: 'local-model',
    requiresApiKey: false,
    suggestedModels: ['local-model'],
    description: 'LM Studio expone un endpoint compatible con OpenAI.'
  },
  {
    id: 'vllm',
    name: 'vLLM (local)',
    baseUrl: 'http://localhost:8000/v1',
    model: 'meta-llama/Llama-3-8B-Instruct',
    requiresApiKey: false,
    suggestedModels: ['meta-llama/Llama-3-8B-Instruct'],
    description: 'Servidor vLLM con endpoint compatible con OpenAI.'
  },
  {
    id: 'custom',
    name: 'Personalizado (OpenAI-compatible)',
    baseUrl: '',
    model: '',
    requiresApiKey: true,
    suggestedModels: [],
    description: 'Configura manualmente cualquier endpoint compatible con OpenAI.'
  }
];

/** Configuración persistida por el usuario. */
export interface AISettings {
  providerId: AIProviderId;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  /** Consentimiento explícito para enviar datos al proveedor. */
  dataSharingConsent: boolean;
  /** Temperatura por defecto. */
  temperature: number;
  /** Token máximo de salida. */
  maxTokens: number;
  /** Indica si las funciones están habilitadas. */
  enabled: boolean;
}

/** Mensaje de chat en formato agnóstico al proveedor. */
export interface ChatMessage {
  id?: ID;
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** Adjuntos generados por la IA (gráficos, tablas). */
  attachments?: ChatAttachment[];
  /** Vista previa de registro detectada por el chat (gasto / servicio / suscripción). */
  registerPreview?: ChatRegisterPreview;
  timestamp?: string;
}

export interface ChatRegisterPreview {
  kind: 'expense' | 'service' | 'subscription';
  description: string;
  amount: number;
  currency: string;
  date: string;
  categoryId?: string;
  paymentMethodId?: string;
  ambiguous: boolean;
  hints: string[];
  prettyKind: string;
  actionLabel: string;
}

export interface ChatAttachment {
  kind: 'chart' | 'table' | 'recommendation' | 'plan' | 'alert';
  title?: string;
  data?: unknown;
}

/** Clasificación heurística que devuelve el clasificador (IA o fallback). */
export interface ClassifiedDraft {
  description: string;
  amount: number;
  currency: string;
  categoryId?: ID;
  paymentMethodId?: ID;
  date: string;
  kind: 'expense' | 'income' | 'service' | 'subscription' | 'loan_payment' | 'transfer';
  /** Indica si hubo ambigüedad y se debe pedir confirmación al usuario. */
  ambiguous?: boolean;
  /** Razones o pistas detectadas (palabras clave). */
  hints?: string[];
}

/** Recomendación que la IA expone al usuario. */
export interface AIRecommendation {
  id: ID;
  title: string;
  description: string;
  /** Severidad / urgencia. */
  severity: 'info' | 'success' | 'warning' | 'danger';
  /** Acción opcional a aplicar (con confirmación previa). */
  actionLabel?: string;
  actionPayload?: unknown;
  createdAt: string;
}

/** Plan de pagos generado por la IA. */
export interface PaymentPlan {
  id?: ID;
  generatedAt: string;
  /** Resumen del plan en lenguaje natural. */
  summary: string;
  /** Detalle por fecha. */
  items: PaymentPlanItem[];
  /** Liquidez disponible al inicio. */
  startingLiquidity: number;
  /** Ingresos esperados durante el horizonte. */
  expectedIncome: number;
  /** Total a reservar. */
  totalToReserve: number;
}

export interface PaymentPlanItem {
  date: string;
  referenceId?: ID;
  description: string;
  amount: number;
  currency: string;
  /** Prioridad calculada (1 = más alta). */
  priority: number;
  /** Razón humana. */
  reason: string;
  /** Si el plan sugiere no pagar o esperar. */
  optional: boolean;
}

/** Resultado de una simulación financiera. */
export interface SimulationResult {
  id: ID;
  question: string;
  summary: string;
  /** Impacto monetario estimado (puede ser positivo o negativo). */
  impactAmount: number;
  currency: string;
  /** Datos tabulares adicionales para mostrar al usuario. */
  table?: { label: string; value: string }[];
  /** Pasos o consideraciones adicionales. */
  considerations: string[];
  createdAt: string;
}

/** Alerta de riesgo detectada automáticamente. */
export interface RiskAlert {
  id: ID;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'danger';
  /** Sugerencia concreta para reducir el impacto. */
  suggestion?: string;
  createdAt: string;
}