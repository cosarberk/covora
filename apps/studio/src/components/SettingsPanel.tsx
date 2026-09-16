/**
 * @module studio/components/SettingsPanel
 *
 * Bir projenin coverage yapılandırmasını ve merge gate politikasını düzenler:
 * kısmi kredi, seviye eşikleri, asgari skor, blocker/regresyon blokları ve
 * regresyon eşiği. Kaydedilmezse @covora/core varsayılanları geçerlidir.
 */

import { useCallback, useEffect, useState } from 'react'

import type { ProjectConfigInput, StudioApi } from '../api/client.js'

/** {@link SettingsPanel} props. */
export interface SettingsPanelProps {
  readonly api: StudioApi
  readonly projectKey: string
}

interface LevelRow {
  id: string
  minScore: number
}

/**
 * Proje ayarları paneli.
 *
 * @param props - API ve proje anahtarı.
 */
export const SettingsPanel = ({ api, projectKey }: SettingsPanelProps): React.JSX.Element => {
  const [partialCredit, setPartialCredit] = useState(0.5)
  const [levels, setLevels] = useState<LevelRow[]>([])
  const [gateMinScore, setGateMinScore] = useState(60)
  const [blockOnFailedBlockers, setBlockOnFailedBlockers] = useState(true)
  const [blockOnRegression, setBlockOnRegression] = useState(false)
  const [regressionThreshold, setRegressionThreshold] = useState(5)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const config = await api.getProjectConfig(projectKey)
      setPartialCredit(config.coverageConfig.partialCredit)
      setLevels(config.coverageConfig.levels.map((level) => ({ ...level })))
      setGateMinScore(config.gatePolicy.minScore)
      setBlockOnFailedBlockers(config.gatePolicy.blockOnFailedBlockers)
      setBlockOnRegression(config.gatePolicy.blockOnRegression)
      setRegressionThreshold(config.gatePolicy.regressionThreshold)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    } finally {
      setLoading(false)
    }
  }, [api, projectKey])

  useEffect(() => {
    void load()
  }, [load])

  const updateLevel = (index: number, patch: Partial<LevelRow>): void => {
    setLevels((current) =>
      current.map((level, position) => (position === index ? { ...level, ...patch } : level))
    )
  }

  const addLevel = (): void => setLevels((current) => [...current, { id: '', minScore: 0 }])
  const removeLevel = (index: number): void =>
    setLevels((current) => current.filter((_, position) => position !== index))

  const save = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const cleanLevels = levels
      .filter((level) => level.id.trim().length > 0)
      .map((level) => ({ id: level.id.trim(), minScore: level.minScore }))
    if (cleanLevels.length === 0) {
      setError('En az bir seviye tanımlanmalı (tabanı 0 olan dahil).')
      return
    }
    const input: ProjectConfigInput = {
      partialCredit,
      levels: cleanLevels,
      gateMinScore,
      gateBlockOnFailedBlockers: blockOnFailedBlockers,
      gateBlockOnRegression: blockOnRegression,
      regressionThreshold
    }
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await api.updateProjectConfig(projectKey, input)
      setSaved(true)
      globalThis.setTimeout(() => setSaved(false), 1500)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="state">Yükleniyor…</div>
  }

  return (
    <form className="settings" onSubmit={(event) => void save(event)}>
      {error !== null && <div className="state state--error">{error}</div>}

      <fieldset className="settings__group">
        <legend>Coverage</legend>
        <label className="field">
          <span className="field__label">Kısmi kredi (0–1)</span>
          <input
            className="input input--narrow"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={partialCredit}
            onChange={(event) => setPartialCredit(Number(event.target.value))}
          />
          <span className="field__hint">“partial” sonucuna verilen ağırlık katsayısı.</span>
        </label>

        <div className="field">
          <span className="field__label">Seviye eşikleri</span>
          {levels.map((level, index) => (
            <div key={index} className="level-row">
              <input
                className="input"
                placeholder="seviye id (örn. good)"
                value={level.id}
                onChange={(event) => updateLevel(index, { id: event.target.value })}
              />
              <input
                className="input input--narrow"
                type="number"
                min={0}
                max={100}
                value={level.minScore}
                onChange={(event) => updateLevel(index, { minScore: Number(event.target.value) })}
              />
              <button type="button" className="link-button" onClick={() => removeLevel(index)}>
                Sil
              </button>
            </div>
          ))}
          <button type="button" className="link-button" onClick={addLevel}>
            + Seviye ekle
          </button>
        </div>
      </fieldset>

      <fieldset className="settings__group">
        <legend>Merge Gate</legend>
        <label className="field">
          <span className="field__label">Asgari coverage skoru (0–100)</span>
          <input
            className="input input--narrow"
            type="number"
            min={0}
            max={100}
            value={gateMinScore}
            onChange={(event) => setGateMinScore(Number(event.target.value))}
          />
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={blockOnFailedBlockers}
            onChange={(event) => setBlockOnFailedBlockers(event.target.checked)}
          />
          Uyumsuz blocker kural merge'i durdursun
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={blockOnRegression}
            onChange={(event) => setBlockOnRegression(event.target.checked)}
          />
          Coverage regresyonu merge'i durdursun
        </label>

        <label className="field">
          <span className="field__label">Regresyon eşiği (puan)</span>
          <input
            className="input input--narrow"
            type="number"
            min={0}
            step={0.5}
            value={regressionThreshold}
            onChange={(event) => setRegressionThreshold(Number(event.target.value))}
          />
          <span className="field__hint">
            Önceki review'a göre bu kadar puan düşüş regresyon sayılır.
          </span>
        </label>
      </fieldset>

      <div className="settings__actions">
        <button className="button" type="submit" disabled={saving}>
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        {saved && <span className="settings__saved">Kaydedildi ✓</span>}
      </div>
    </form>
  )
}
