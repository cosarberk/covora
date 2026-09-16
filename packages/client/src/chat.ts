/**
 * @module @covora/client/chat
 *
 * İnteraktif review sohbeti istemcisi. Ekranı yakalayıp soruyla birlikte
 * sunucuya gönderir; konuşarak inceleme yapılmasını sağlar. Geçmiş çağıran
 * tarafta tutulur.
 */

import type { ChatMessage } from '@covora/types'

import { captureScreenshot } from './capture.js'

/** Sohbet istemcisi yapılandırması. */
export interface CovoraChatConfig {
  /** Review sunucusunun temel adresi. */
  readonly serverUrl: string
  /** Review edilen projenin anahtarı. */
  readonly projectKey: string
  /** Projenin ingest token'ı (studio'dan alınır). */
  readonly ingestToken: string
}

/** İnteraktif sohbet istemcisi. */
export interface CovoraChat {
  /** Mesaj geçmişini gönderir ve asistan yanıtını döner. */
  ask(messages: readonly ChatMessage[]): Promise<string>
  /**
   * O anki ekranı yakalar, soruyu geçmişe ekleyip gönderir ve yanıtı döner.
   *
   * @param question - Kullanıcının sorusu.
   * @param history - Önceki sohbet mesajları.
   * @param element - Yakalanacak kök eleman.
   */
  askAboutScreen(
    question: string,
    history?: readonly ChatMessage[],
    element?: HTMLElement
  ): Promise<string>
}

/**
 * Bir Covora sohbet istemcisi oluşturur.
 *
 * @param config - Sunucu adresi.
 * @returns {@link CovoraChat}.
 */
export const createCovoraChat = (config: CovoraChatConfig): CovoraChat => {
  const ask = async (messages: readonly ChatMessage[]): Promise<string> => {
    const response = await fetch(`${config.serverUrl}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-covora-token': config.ingestToken },
      body: JSON.stringify({ projectKey: config.projectKey, messages })
    })
    if (!response.ok) {
      throw new Error(`Sohbet isteği başarısız: ${response.status} ${response.statusText}`)
    }
    const data = (await response.json()) as { reply: string }
    return data.reply
  }

  const askAboutScreen = async (
    question: string,
    history: readonly ChatMessage[] = [],
    element: HTMLElement = document.body
  ): Promise<string> => {
    const screenshot = await captureScreenshot(element)
    const messages: ChatMessage[] = [
      ...history,
      { role: 'user', content: question, images: [screenshot] }
    ]
    return ask(messages)
  }

  return { ask, askAboutScreen }
}
