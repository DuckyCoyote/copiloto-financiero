import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  AIProviderId,
  AI_PROVIDERS,
  AISettings,
  ChatMessage,
  ID
} from '../models';
import { STORAGE_KEYS, StorageService } from './storage.service';

const DEFAULT_SETTINGS: AISettings = {
  providerId: 'openai',
  apiKey: '',
  baseUrl: '',
  model: '',
  dataSharingConsent: false,
  temperature: 0.2,
  maxTokens: 1024,
  enabled: false
};

/**
 * Servicio de IA agnóstico al proveedor.
 *
 * Soporta cualquier endpoint compatible con el formato
 * `POST {baseUrl}/chat/completions` (OpenAI, Gemini vía
 * compatibilidad, OpenRouter, Ollama, LM Studio, vLLM,
 * etc.). Para Anthropic se utiliza el Messages API.
 *
 * Antes de llamar a un proveedor externo se valida
 * `dataSharingConsent` y la presencia del API Key cuando
 * es requerida.
 */
@Injectable({ providedIn: 'root' })
export class AIService {
  private readonly storage = inject(StorageService);
  private readonly http = inject(HttpClient);

  private readonly _settings = signal<AISettings>(
    this.storage.read<AISettings>(STORAGE_KEYS.aiSettings, DEFAULT_SETTINGS)
  );
  readonly settings = this._settings.asReadonly();

  readonly provider = computed(() =>
    AI_PROVIDERS.find(p => p.id === this._settings().providerId) ?? AI_PROVIDERS[0]
  );

  /** Indica si la configuración está lista para usar. */
  readonly isConfigured = computed(() => {
    const s = this._settings();
    if (!s.enabled) return false;
    const p = this.provider();
    if (p.requiresApiKey && !s.apiKey) return false;
    if (!this.resolveBaseUrl()) return false;
    if (!this.resolveModel()) return false;
    return true;
  });

  // ---------------------------------------------------------------------
  // Configuración
  // ---------------------------------------------------------------------

  updateSettings(patch: Partial<AISettings>): void {
    const next = { ...this._settings(), ...patch };
    this._settings.set(next);
    this.storage.write(STORAGE_KEYS.aiSettings, next);
  }

  selectProvider(id: AIProviderId): void {
    const provider = AI_PROVIDERS.find(p => p.id === id);
    this.updateSettings({
      providerId: id,
      baseUrl: provider?.baseUrl,
      model: provider?.model
    });
  }

  resolveBaseUrl(): string {
    const s = this._settings();
    return (s.baseUrl || this.provider().baseUrl || '').replace(/\/$/, '');
  }

  resolveModel(): string {
    return this._settings().model || this.provider().model;
  }

  resetSettings(): void {
    this._settings.set(DEFAULT_SETTINGS);
    this.storage.write(STORAGE_KEYS.aiSettings, DEFAULT_SETTINGS);
  }

  // ---------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------

  /**
   * Envía los mensajes al proveedor actual y devuelve la respuesta del
   * asistente. Lanza error si la IA no está habilitada o configurada.
   */
  async chat(messages: ChatMessage[]): Promise<ChatMessage> {
    const s = this._settings();
    if (!s.enabled) {
      throw new Error('La IA está deshabilitada. Actívala en Configuración.');
    }
    if (!s.dataSharingConsent && this.provider().id !== 'ollama' && this.provider().id !== 'lmstudio' && this.provider().id !== 'vllm') {
      throw new Error('No has dado tu consentimiento para enviar datos al proveedor de IA.');
    }

    const provider = this.provider();
    if (provider.id === 'claude') {
      return this.chatAnthropic(messages);
    }
    return this.chatOpenAICompatible(messages);
  }

  /** Llamada al endpoint OpenAI-compatible. */
  private async chatOpenAICompatible(messages: ChatMessage[]): Promise<ChatMessage> {
    const s = this._settings();
    const baseUrl = this.resolveBaseUrl();
    if (!baseUrl) {
      throw new Error('No has configurado el endpoint del proveedor de IA. Ve a Configuración.');
    }
    if (!s.apiKey && this.provider().requiresApiKey) {
      throw new Error('Falta la API Key. Ve a Configuración y añádela.');
    }
    const url = `${baseUrl}/chat/completions`;
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      ...(s.apiKey ? { Authorization: `Bearer ${s.apiKey}` } : {})
    });
    const body: Record<string, unknown> = {
      model: this.resolveModel(),
      messages: messages.map(m => ({ role: m.role, content: m.content }))
    };
    // Los modelos nuevos de OpenAI (gpt-5*, o1, o3) usan
    // `max_completion_tokens`. Los antiguos siguen aceptando
    // `max_tokens`. Detectamos el modelo para enviar el correcto.
    if (this.usesNewCompletionParam()) {
      body['max_completion_tokens'] = s.maxTokens;
    } else {
      body['max_tokens'] = s.maxTokens;
    }
    // Los modelos de razonamiento (o1, o3, gpt-5*) no aceptan
    // `temperature` distinto del valor por defecto.
    if (!this.isReasoningModel()) {
      body['temperature'] = s.temperature;
    }
    try {
      const response = await firstValueFrom(
        this.http.post<{ choices: { message: { content: string } }[] }>(url, body, { headers })
      );
      const content = response.choices?.[0]?.message?.content ?? '';
      return {
        id: this.makeId(),
        role: 'assistant',
        content,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      throw this.translateError(err);
    }
  }

  /** Llamada al Messages API de Anthropic. */
  private async chatAnthropic(messages: ChatMessage[]): Promise<ChatMessage> {
    const s = this._settings();
    const baseUrl = this.resolveBaseUrl();
    if (!baseUrl) {
      throw new Error('No has configurado el endpoint de Anthropic.');
    }
    if (!s.apiKey) {
      throw new Error('Falta la API Key de Anthropic.');
    }
    const url = `${baseUrl}/messages`;
    const systemMessage = messages.find(m => m.role === 'system');
    const other = messages.filter(m => m.role !== 'system');
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'x-api-key': s.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    });
    const body = {
      model: this.resolveModel(),
      max_tokens: s.maxTokens,
      temperature: s.temperature,
      system: systemMessage?.content,
      messages: other.map(m => ({ role: m.role, content: m.content }))
    };
    try {
      const response = await firstValueFrom(
        this.http.post<{ content: { text: string }[] }>(url, body, { headers })
      );
      const content = response.content?.map(c => c.text).join('\n') ?? '';
      return {
        id: this.makeId(),
        role: 'assistant',
        content,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      throw this.translateError(err);
    }
  }

  /**
   * Convierte un `HttpErrorResponse` en un mensaje accionable.
   * Importante porque muchos gateways/proxies no devuelven CORS en
   * respuestas de error y el navegador oculta el cuerpo original.
   */
  private translateError(err: unknown): Error {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) {
        return new Error(
          'No se pudo contactar al proveedor. Posible CORS, sin internet o endpoint incorrecto. ' +
          'Si usas un proxy, asegúrate de que devuelva los headers CORS en respuestas de error.'
        );
      }
      if (err.status === 401) {
        return new Error('401 No autorizado. Revisa tu API Key en Configuración.');
      }
      if (err.status === 403) {
        return new Error('403 Acceso denegado. La API Key no tiene permisos para este modelo o endpoint.');
      }
      if (err.status === 404) {
        return new Error(`404 No encontrado. Verifica que el modelo "${this.resolveModel()}" exista y que el endpoint sea correcto.`);
      }
      if (err.status === 429) {
        return new Error('429 Demasiadas solicitudes o cuota agotada. Intenta más tarde o revisa tu plan.');
      }
      if (err.status >= 500) {
        return new Error(`Error del servidor (${err.status}). El proveedor tiene problemas. Intenta más tarde.`);
      }
      // Cuerpo legible (algunos proveedores sí devuelven CORS en errores)
      const body = (err.error && typeof err.error === 'object') ? err.error : null;
      const msg = body?.error?.message || err.message || `Error HTTP ${err.status}`;
      return new Error(`${err.status} ${msg}`);
    }
    if (err instanceof Error) return err;
    return new Error(String(err));
  }

  private makeId(): ID {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
    return `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  // ---------------------------------------------------------------------
  // Detección de familia de modelo
  // ---------------------------------------------------------------------

  /** true si el modelo activo requiere `max_completion_tokens`. */
  private usesNewCompletionParam(): boolean {
    return this.isReasoningModel();
  }

  /**
   * Modelos "de razonamiento" de OpenAI (o1, o3, gpt-5*) que
   * cambian la API:
   *  - usan `max_completion_tokens` en lugar de `max_tokens`
   *  - sólo aceptan `temperature: 1` (no se puede ajustar)
   *  - algunas veces requieren `reasoning_effort`
   */
  private isReasoningModel(): boolean {
    const m = (this.resolveModel() || '').toLowerCase();
    return /\b(o1|o3|o4|gpt-5|reasoning)\b/.test(m);
  }
}