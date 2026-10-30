import { describe, it, expect } from 'vitest';
import {
  filterAndEnrichModels,
  getDefaultModels,
  type RawModelInput,
  type ModelHints,
} from '../../src/providers/modelFilter';
import type { ModelInfo } from '../../src/types';

describe('Model Filter & Capability Inference (src/providers/modelFilter.ts)', () => {
  const customHints: ModelHints = {
    nonChatIdPatterns: ['embed', 'whisper', 'moderation'],
    smallTierIdPatterns: ['haiku', 'flash', 'mini'],
    imageCapableIdPatterns: ['vision-model'],
    noImageIdPatterns: ['text-only-model'],
    pdfCapableIdPatterns: ['pdf-pro'],
    recommended: {
      anthropic: ['claude-3-5-sonnet'],
      gemini: ['gemini-1.5-pro'],
    },
  };

  it('correctly maps Anthropic model with API capability metadata', () => {
    const raw: RawModelInput[] = [
      {
        id: 'claude-3-5-sonnet',
        displayName: 'Claude 3.5 Sonnet',
        provider: 'anthropic',
        capabilities: {
          image_input: { supported: true },
          pdf_input: { supported: true },
        },
      },
      {
        id: 'claude-3-haiku',
        displayName: 'Claude 3 Haiku',
        provider: 'anthropic',
        capabilities: {
          image_input: { supported: false },
          pdf_input: { supported: false },
        },
      },
      {
        id: 'claude-text-embed',
        displayName: 'Claude Embedding',
        provider: 'anthropic',
      },
    ];

    const result = filterAndEnrichModels(raw, 'anthropic', customHints);
    expect(result).toHaveLength(3);

    const sonnet = result.find((m) => m.id === 'claude-3-5-sonnet')!;
    expect(sonnet.likelyChat).toBe(true);
    expect(sonnet.supportsImages).toBe('yes');
    expect(sonnet.supportsPdf).toBe('yes');
    expect(sonnet.capabilitySource).toBe('api-metadata');
    expect(sonnet.smallTierGuess).toBe(false);

    const haiku = result.find((m) => m.id === 'claude-3-haiku')!;
    expect(haiku.likelyChat).toBe(true);
    expect(haiku.supportsImages).toBe('no');
    expect(haiku.supportsPdf).toBe('no');
    expect(haiku.capabilitySource).toBe('api-metadata');
    expect(haiku.smallTierGuess).toBe(true); // matches 'haiku'

    const embed = result.find((m) => m.id === 'claude-text-embed')!;
    expect(embed.likelyChat).toBe(false); // matches 'embed'
  });

  it('sets capability to unknown when nested capabilities.image_input.supported is missing or non-object', () => {
    const raw: RawModelInput[] = [
      {
        id: 'claude-missing-cap',
        displayName: 'Claude Missing Cap',
        provider: 'anthropic',
        capabilities: {
          batch: { supported: true },
          // image_input and pdf_input are omitted
        },
      },
      {
        id: 'claude-malformed-cap',
        displayName: 'Claude Malformed Cap',
        provider: 'anthropic',
        capabilities: {
          image_input: undefined,
          pdf_input: { supported: undefined },
        },
      },
    ];

    const result = filterAndEnrichModels(raw, 'anthropic', customHints);
    expect(result).toHaveLength(2);

    const missing = result.find((m) => m.id === 'claude-missing-cap')!;
    expect(missing.supportsImages).toBe('unknown');
    expect(missing.supportsPdf).toBe('unknown');
    expect(missing.capabilitySource).toBe('api-metadata');

    const malformed = result.find((m) => m.id === 'claude-malformed-cap')!;
    expect(malformed.supportsImages).toBe('unknown');
    expect(malformed.supportsPdf).toBe('unknown');
    expect(malformed.capabilitySource).toBe('api-metadata');
  });

  it('correctly maps Gemini models and respects supportedGenerationMethods', () => {
    const raw: RawModelInput[] = [
      {
        id: 'gemini-1.5-pro',
        displayName: 'Gemini 1.5 Pro',
        provider: 'gemini',
        supportedGenerationMethods: ['generateContent', 'countTokens'],
      },
      {
        id: 'text-embedding-004',
        displayName: 'Text Embedding 004',
        provider: 'gemini',
        supportedGenerationMethods: ['embedContent'],
      },
      {
        id: 'gemini-1.5-flash',
        displayName: 'Gemini 1.5 Flash',
        provider: 'gemini',
        supportedGenerationMethods: ['generateContent'],
      },
    ];

    const result = filterAndEnrichModels(raw, 'gemini', customHints);

    const pro = result.find((m) => m.id === 'gemini-1.5-pro')!;
    expect(pro.likelyChat).toBe(true);
    expect(pro.supportsImages).toBe('unknown');
    expect(pro.supportsPdf).toBe('unknown');
    expect(pro.capabilitySource).toBe('none');
    expect(pro.smallTierGuess).toBe(false);

    const embed = result.find((m) => m.id === 'text-embedding-004')!;
    expect(embed.likelyChat).toBe(false); // does not have generateContent and matches 'embed'

    const flash = result.find((m) => m.id === 'gemini-1.5-flash')!;
    expect(flash.likelyChat).toBe(true);
    expect(flash.smallTierGuess).toBe(true); // matches 'flash'
  });

  it('places recommended models first', () => {
    const raw: RawModelInput[] = [
      { id: 'claude-3-opus', displayName: 'Claude 3 Opus', provider: 'anthropic' },
      { id: 'claude-3-5-sonnet', displayName: 'Claude 3.5 Sonnet', provider: 'anthropic' },
      { id: 'claude-3-haiku', displayName: 'Claude 3 Haiku', provider: 'anthropic' },
    ];

    const result = filterAndEnrichModels(raw, 'anthropic', customHints);
    expect(result[0].id).toBe('claude-3-5-sonnet'); // Recommended
  });

  it('falls back to pattern guessing when capabilities metadata is absent and patterns match', () => {
    const raw: RawModelInput[] = [
      { id: 'vision-model', provider: 'anthropic' },
      { id: 'text-only-model', provider: 'anthropic' },
      { id: 'pdf-pro', provider: 'anthropic' },
    ];

    const result = filterAndEnrichModels(raw, 'anthropic', customHints);
    const vision = result.find((m) => m.id === 'vision-model')!;
    expect(vision.supportsImages).toBe('yes');
    expect(vision.capabilitySource).toBe('pattern-guess');

    const textOnly = result.find((m) => m.id === 'text-only-model')!;
    expect(textOnly.supportsImages).toBe('no');
    expect(textOnly.capabilitySource).toBe('pattern-guess');

    const pdf = result.find((m) => m.id === 'pdf-pro')!;
    expect(pdf.supportsPdf).toBe('yes');
    expect(pdf.capabilitySource).toBe('pattern-guess');
  });

  describe('getDefaultModels', () => {
    it('returns latest version of Sonnet, Haiku, and Opus for Anthropic with latest tag', () => {
      const models: ModelInfo[] = [
        { id: 'claude-3-5-sonnet-latest', displayName: 'Claude 3.5 Sonnet Latest', provider: 'anthropic', likelyChat: true, supportsImages: 'yes', supportsPdf: 'yes', capabilitySource: 'api-metadata', smallTierGuess: false },
        { id: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet Oct 2024', provider: 'anthropic', likelyChat: true, supportsImages: 'yes', supportsPdf: 'yes', capabilitySource: 'api-metadata', smallTierGuess: false },
        { id: 'claude-3-sonnet-20240229', displayName: 'Claude 3 Sonnet Feb 2024', provider: 'anthropic', likelyChat: true, supportsImages: 'yes', supportsPdf: 'yes', capabilitySource: 'api-metadata', smallTierGuess: false },
        { id: 'claude-3-5-haiku-latest', displayName: 'Claude 3.5 Haiku Latest', provider: 'anthropic', likelyChat: true, supportsImages: 'no', supportsPdf: 'no', capabilitySource: 'api-metadata', smallTierGuess: true },
        { id: 'claude-3-haiku-20240307', displayName: 'Claude 3 Haiku Mar 2024', provider: 'anthropic', likelyChat: true, supportsImages: 'no', supportsPdf: 'no', capabilitySource: 'api-metadata', smallTierGuess: true },
        { id: 'claude-3-opus-latest', displayName: 'Claude 3 Opus Latest', provider: 'anthropic', likelyChat: true, supportsImages: 'yes', supportsPdf: 'yes', capabilitySource: 'api-metadata', smallTierGuess: false },
        { id: 'claude-3-opus-20240229', displayName: 'Claude 3 Opus Feb 2024', provider: 'anthropic', likelyChat: true, supportsImages: 'yes', supportsPdf: 'yes', capabilitySource: 'api-metadata', smallTierGuess: false },
        { id: 'claude-2.1', displayName: 'Claude 2.1', provider: 'anthropic', likelyChat: true, supportsImages: 'no', supportsPdf: 'no', capabilitySource: 'api-metadata', smallTierGuess: false },
      ];

      const defaults = getDefaultModels(models, 'anthropic');
      expect(defaults).toHaveLength(3);
      const ids = defaults.map((m) => m.id);
      expect(ids).toContain('claude-3-5-sonnet-latest');
      expect(ids).toContain('claude-3-5-haiku-latest');
      expect(ids).toContain('claude-3-opus-latest');
    });

    it('returns latest dated versions of Sonnet, Haiku, and Opus when latest tags are absent', () => {
      const models: ModelInfo[] = [
        { id: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet Oct 2024', provider: 'anthropic', likelyChat: true, supportsImages: 'yes', supportsPdf: 'yes', capabilitySource: 'api-metadata', smallTierGuess: false },
        { id: 'claude-3-5-sonnet-20240620', displayName: 'Claude 3.5 Sonnet Jun 2024', provider: 'anthropic', likelyChat: true, supportsImages: 'yes', supportsPdf: 'yes', capabilitySource: 'api-metadata', smallTierGuess: false },
        { id: 'claude-3-sonnet-20240229', displayName: 'Claude 3 Sonnet Feb 2024', provider: 'anthropic', likelyChat: true, supportsImages: 'yes', supportsPdf: 'yes', capabilitySource: 'api-metadata', smallTierGuess: false },
        { id: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku Oct 2024', provider: 'anthropic', likelyChat: true, supportsImages: 'no', supportsPdf: 'no', capabilitySource: 'api-metadata', smallTierGuess: true },
        { id: 'claude-3-haiku-20240307', displayName: 'Claude 3 Haiku Mar 2024', provider: 'anthropic', likelyChat: true, supportsImages: 'no', supportsPdf: 'no', capabilitySource: 'api-metadata', smallTierGuess: true },
        { id: 'claude-3-opus-20240229', displayName: 'Claude 3 Opus Feb 2024', provider: 'anthropic', likelyChat: true, supportsImages: 'yes', supportsPdf: 'yes', capabilitySource: 'api-metadata', smallTierGuess: false },
      ];

      const defaults = getDefaultModels(models, 'anthropic');
      expect(defaults).toHaveLength(3);
      const ids = defaults.map((m) => m.id);
      expect(ids).toContain('claude-3-5-sonnet-20241022');
      expect(ids).toContain('claude-3-5-haiku-20241022');
      expect(ids).toContain('claude-3-opus-20240229');
    });

    it('correctly picks newest 5.5 models over 4.5/4.6/4.7/4.8/5 models for Anthropic', () => {
      const models: ModelInfo[] = [
        { id: 'claude-fable-5', displayName: 'Claude Fable 5', provider: 'anthropic', likelyChat: true, supportsImages: 'no', supportsPdf: 'no', capabilitySource: 'none', smallTierGuess: false },
        { id: 'claude-fable-5-1', displayName: 'Claude Fable 5.1', provider: 'anthropic', likelyChat: true, supportsImages: 'no', supportsPdf: 'no', capabilitySource: 'none', smallTierGuess: false },
        { id: 'claude-haiku-4-5', displayName: 'Claude Haiku 4.5', provider: 'anthropic', likelyChat: true, supportsImages: 'no', supportsPdf: 'no', capabilitySource: 'none', smallTierGuess: true },
        { id: 'claude-haiku-5-5', displayName: 'Claude Haiku 5.5', provider: 'anthropic', likelyChat: true, supportsImages: 'no', supportsPdf: 'no', capabilitySource: 'none', smallTierGuess: true },
        { id: 'claude-opus-4-5', displayName: 'Claude Opus 4.5', provider: 'anthropic', likelyChat: true, supportsImages: 'no', supportsPdf: 'no', capabilitySource: 'none', smallTierGuess: false },
        { id: 'claude-opus-4-6', displayName: 'Claude Opus 4.6', provider: 'anthropic', likelyChat: true, supportsImages: 'no', supportsPdf: 'no', capabilitySource: 'none', smallTierGuess: false },
        { id: 'claude-opus-4-7', displayName: 'Claude Opus 4.7', provider: 'anthropic', likelyChat: true, supportsImages: 'no', supportsPdf: 'no', capabilitySource: 'none', smallTierGuess: false },
        { id: 'claude-opus-4-8', displayName: 'Claude Opus 4.8', provider: 'anthropic', likelyChat: true, supportsImages: 'no', supportsPdf: 'no', capabilitySource: 'none', smallTierGuess: false },
        { id: 'claude-opus-5', displayName: 'Claude Opus 5', provider: 'anthropic', likelyChat: true, supportsImages: 'no', supportsPdf: 'no', capabilitySource: 'none', smallTierGuess: false },
        { id: 'claude-opus-5-5', displayName: 'Claude Opus 5.5', provider: 'anthropic', likelyChat: true, supportsImages: 'no', supportsPdf: 'no', capabilitySource: 'none', smallTierGuess: false },
        { id: 'claude-sonnet-4-5', displayName: 'Claude Sonnet 4.5', provider: 'anthropic', likelyChat: true, supportsImages: 'no', supportsPdf: 'no', capabilitySource: 'none', smallTierGuess: false },
        { id: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6', provider: 'anthropic', likelyChat: true, supportsImages: 'no', supportsPdf: 'no', capabilitySource: 'none', smallTierGuess: false },
        { id: 'claude-sonnet-5', displayName: 'Claude Sonnet 5', provider: 'anthropic', likelyChat: true, supportsImages: 'no', supportsPdf: 'no', capabilitySource: 'none', smallTierGuess: false },
        { id: 'claude-sonnet-5-5', displayName: 'Claude Sonnet 5.5', provider: 'anthropic', likelyChat: true, supportsImages: 'no', supportsPdf: 'no', capabilitySource: 'none', smallTierGuess: false },
      ];

      const defaults = getDefaultModels(models, 'anthropic');
      expect(defaults).toHaveLength(3);
      expect(defaults[0].displayName).toBe('Claude Sonnet 5.5');
      expect(defaults[1].displayName).toBe('Claude Haiku 5.5');
      expect(defaults[2].displayName).toBe('Claude Opus 5.5');
    });

    it('returns latest tag version of Flash, Flash-lite, and Pro for Gemini', () => {
      const models: ModelInfo[] = [
        { id: 'gemini-1.5-flash-latest', displayName: 'Gemini 1.5 Flash (Latest)', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: true },
        { id: 'gemini-1.5-flash-001', displayName: 'Gemini 1.5 Flash 001', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: true },
        { id: 'gemini-1.5-flash-8b-latest', displayName: 'Gemini 1.5 Flash 8B (Latest)', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: true },
        { id: 'gemini-1.5-flash-8b-001', displayName: 'Gemini 1.5 Flash 8B 001', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: true },
        { id: 'gemini-1.5-pro-latest', displayName: 'Gemini 1.5 Pro (Latest)', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
        { id: 'gemini-1.5-pro-001', displayName: 'Gemini 1.5 Pro 001', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
        { id: 'text-embedding-004', displayName: 'Text Embedding 004', provider: 'gemini', likelyChat: false, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
      ];

      const defaults = getDefaultModels(models, 'gemini');
      expect(defaults).toHaveLength(3);
      const ids = defaults.map((m) => m.id);
      expect(ids).toContain('gemini-1.5-flash-latest');
      expect(ids).toContain('gemini-1.5-flash-8b-latest');
      expect(ids).toContain('gemini-1.5-pro-latest');
    });

    it('returns latest tag models matching user UI for Gemini (Gemini Flash Latest, Gemini Flash-Lite Latest, Gemini Pro Latest)', () => {
      const models: ModelInfo[] = [
        { id: 'gemini-flash-latest', displayName: 'Gemini Flash Latest', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: true },
        { id: 'gemini-flash-lite-latest', displayName: 'Gemini Flash-Lite Latest', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: true },
        { id: 'gemini-pro-latest', displayName: 'Gemini Pro Latest', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
        { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: true },
        { id: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: true },
        { id: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
      ];

      const defaults = getDefaultModels(models, 'gemini');
      expect(defaults).toHaveLength(3);
      expect(defaults[0].displayName).toBe('Gemini Flash Latest');
      expect(defaults[1].displayName).toBe('Gemini Flash-Lite Latest');
      expect(defaults[2].displayName).toBe('Gemini Pro Latest');
    });

    it('ignores extraneous models like Gemini 2.5 Flash Native Audio Latest and picks constant aliases', () => {
      const models: ModelInfo[] = [
        { id: 'gemini-2.5-flash-native-audio-latest', displayName: 'Gemini 2.5 Flash Native Audio Latest', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: true },
        { id: 'gemini-flash-latest', displayName: 'Gemini Flash Latest', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: true },
        { id: 'gemini-flash-lite-latest', displayName: 'Gemini Flash-Lite Latest', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: true },
        { id: 'gemini-pro-latest', displayName: 'Gemini Pro Latest', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
      ];

      const defaults = getDefaultModels(models, 'gemini');
      expect(defaults).toHaveLength(3);
      expect(defaults[0].id).toBe('gemini-flash-latest');
      expect(defaults[0].displayName).toBe('Gemini Flash Latest');
      expect(defaults[1].id).toBe('gemini-flash-lite-latest');
      expect(defaults[1].displayName).toBe('Gemini Flash-Lite Latest');
      expect(defaults[2].id).toBe('gemini-pro-latest');
      expect(defaults[2].displayName).toBe('Gemini Pro Latest');
    });

    it('falls back to all likelyChat models if patterns are empty or nothing matches', () => {
      const models: ModelInfo[] = [
        { id: 'custom-chat-1', displayName: 'Custom Chat 1', provider: 'anthropic', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
        { id: 'custom-embed-1', displayName: 'Custom Embed 1', provider: 'anthropic', likelyChat: false, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
      ];

      const emptyHints: ModelHints = {
        ...customHints,
        defaultPatterns: { anthropic: [] },
      };

      const defaults = getDefaultModels(models, 'anthropic', emptyHints);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe('custom-chat-1');

      const nonMatchingHints: ModelHints = {
        ...customHints,
        defaultPatterns: { anthropic: ['non-existent-pattern'] },
      };

      const defaults2 = getDefaultModels(models, 'anthropic', nonMatchingHints);
      expect(defaults2).toHaveLength(1);
      expect(defaults2[0].id).toBe('custom-chat-1');
    });
  });
});

