/**
 * @module @covora/client/client
 *
 * Covora review sunucusuyla konuşan client. Host uygulama (örn. mock-shell)
 * bunu kurup bir "Review" aksiyonundan çağırır.
 */

import type { ReviewInput, ReviewOutcome } from '@covora/types'

import { captureScreenshot } from './capture.js'

/** Client yapılandırması. */
export interface CovoraClientConfig {
  /** Review sunucusunun temel adresi. */
  readonly serverUrl: string
  /** Review edilen projenin anahtarı. */
  readonly projectKey: string
}

/** Bir review isteğinin parametreleri. */
export interface ReviewRequestParams {
  /** Review girdisi. */
  readonly input: ReviewInput
  /** Review edilen kodun/durumun hash'i. */
  readonly codeHash: string
}

/** Sunucudan dönen review sonucu. */
export interface CreateReviewResponse extends ReviewOutcome {
  /** Kaydedilen review kimliği. */
  readonly reviewId: string
}

/** Covora client arayüzü. */
export interface CovoraClient {
  /** Hazır bir girdiyle review çalıştırır. */
  review(params: ReviewRequestParams): Promise<CreateReviewResponse>
  /** O anki ekranı yakalayıp UI review çalıştırır. */
  reviewUi(codeHash: string, element?: HTMLElement): Promise<CreateReviewResponse>
}

/**
 * Bir Covora client örneği oluşturur.
 *
 * @param config - Sunucu adresi ve proje anahtarı.
 * @returns Yapılandırılmış {@link CovoraClient}.
 */
export const createCovoraClient = (config: CovoraClientConfig): CovoraClient => {
  const review = async (params: ReviewRequestParams): Promise<CreateReviewResponse> => {
    const response = await fetch(`${config.serverUrl}/reviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectKey: config.projectKey,
        codeHash: params.codeHash,
        input: params.input
      })
    })

    if (!response.ok) {
      throw new Error(`Review isteği başarısız: ${response.status} ${response.statusText}`)
    }

    return (await response.json()) as CreateReviewResponse
  }

  const reviewUi = async (
    codeHash: string,
    element: HTMLElement = document.body
  ): Promise<CreateReviewResponse> => {
    const screenshot = await captureScreenshot(element)
    return review({ input: { kind: 'ui', screenshot }, codeHash })
  }

  return { review, reviewUi }
}
