import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  filterAndEnrichModels,
  getDefaultModels,
  compareModelFreshness,
  type RawModelInput,
  type ModelHints,
} from '../../src/providers/modelFilter';
import type { ModelInfo } from '../../src/types';

describe('Model Filter & Capability Inference (src/providers/modelFilter.ts)', () => {
  const customHints: ModelHints = {
    nonChatIdPatterns: ['embed', 'whisper', 'moderation'],
    smallTierIdPatterns: ['nano', 'lite', 'haiku', 'flash-8b', 'small'],
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
        id: 'gemini-1.5-flash-8b',
        displayName: 'Gemini 1.5 Flash 8B',
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

    const flash = result.find((m) => m.id === 'gemini-1.5-flash-8b')!;
    expect(flash.likelyChat).toBe(true);
    expect(flash.smallTierGuess).toBe(true); // matches 'flash-8b'
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
        { id: 'claude-3-sonnet-20240229', displayName: 'Claude 3 Sonnet Feb 2024', provider: 'anthropic', likelyChat: true, supportsImages: 'yes', supportsPdf: 'yes', capabilitySource: 'api-metadata', smallTierGuess: false },
        { id: 'claude-3-5-haiku-latest', displayName: 'Claude 3.5 Haiku Latest', provider: 'anthropic', likelyChat: true, supportsImages: 'no', supportsPdf: 'no', capabilitySource: 'api-metadata', smallTierGuess: true },
        { id: 'claude-3-haiku-20240307', displayName: 'Claude 3 Haiku Mar 2024', provider: 'anthropic', likelyChat: true, supportsImages: 'no', supportsPdf: 'no', capabilitySource: 'api-metadata', smallTierGuess: true },
        { id: 'claude-3-opus-latest', displayName: 'Claude 3 Opus Latest', provider: 'anthropic', likelyChat: true, supportsImages: 'yes', supportsPdf: 'yes', capabilitySource: 'api-metadata', smallTierGuess: false },
        { id: 'claude-3-opus', displayName: 'Claude 3 Opus', provider: 'anthropic', likelyChat: true, supportsImages: 'yes', supportsPdf: 'yes', capabilitySource: 'api-metadata', smallTierGuess: false },
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
        { id: 'models/gemini-flash-latest', displayName: 'Gemini Flash Latest', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
        { id: 'models/gemini-flash-lite-latest', displayName: 'Gemini Flash-Lite Latest', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: true },
        { id: 'models/gemini-pro-latest', displayName: 'Gemini Pro Latest', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
        { id: 'models/gemini-1.5-flash-001', displayName: 'Gemini 1.5 Flash 001', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
        { id: 'models/gemini-1.5-pro-001', displayName: 'Gemini 1.5 Pro 001', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
        { id: 'models/text-embedding-004', displayName: 'Text Embedding 004', provider: 'gemini', likelyChat: false, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
      ];

      const defaults = getDefaultModels(models, 'gemini');
      expect(defaults).toHaveLength(3);
      const ids = defaults.map((m) => m.id);
      expect(ids).toContain('models/gemini-flash-latest');
      expect(ids).toContain('models/gemini-flash-lite-latest');
      expect(ids).toContain('models/gemini-pro-latest');
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

  describe('Model picker (§13.4, §19.3)', () => {
    const fixtureHints: ModelHints = {
      nonChatIdPatterns: ['embed', 'whisper'],
      smallTierIdPatterns: ['nano', 'lite', 'haiku', 'flash-8b', 'small'],
      imageCapableIdPatterns: [],
      noImageIdPatterns: [],
      pdfCapableIdPatterns: [],
      recommended: {
        anthropic: ['claude-3-opus'],
        gemini: ['models/gemini-pro-latest'],
      },
      defaultPatterns: {
        anthropic: ['opus', 'sonnet', 'haiku'],
        gemini: ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest'],
      },
    };

    it('exact ID match with and without models/ prefix', () => {
      const modelsWithPrefix: ModelInfo[] = [
        { id: 'models/gemini-flash-latest', displayName: 'Flash', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
      ];
      const resWith = getDefaultModels(modelsWithPrefix, 'gemini', fixtureHints);
      expect(resWith).toHaveLength(1);
      expect(resWith[0].id).toBe('models/gemini-flash-latest');

      const modelsWithoutPrefix: ModelInfo[] = [
        { id: 'gemini-flash-latest', displayName: 'Flash', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
      ];
      const resWithout = getDefaultModels(modelsWithoutPrefix, 'gemini', fixtureHints);
      expect(resWithout).toHaveLength(1);
      expect(resWithout[0].id).toBe('gemini-flash-latest');
    });

    it('display-name match and hyphen-to-space display-name match', () => {
      const models: ModelInfo[] = [
        // Exact display name match
        { id: 'custom-id-1', displayName: 'gemini-flash-latest', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
        // Hyphens in pattern match spaces in display name
        { id: 'custom-id-2', displayName: 'Gemini Flash Lite Latest', provider: 'gemini', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: true },
      ];
      const defaults = getDefaultModels(models, 'gemini', fixtureHints);
      expect(defaults.map((m) => m.id)).toEqual(['custom-id-1', 'custom-id-2']);
    });

    it('family pattern picks the freshest match', () => {
      const models: ModelInfo[] = [
        { id: 'claude-3-sonnet', displayName: 'Claude 3 Sonnet', provider: 'anthropic', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
        { id: 'claude-3-5-sonnet', displayName: 'Claude 3.5 Sonnet', provider: 'anthropic', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
        { id: 'claude-3-7-sonnet', displayName: 'Claude 3.7 Sonnet', provider: 'anthropic', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
      ];
      const hints: ModelHints = {
        ...fixtureHints,
        defaultPatterns: { anthropic: ['sonnet'] },
      };
      const defaults = getDefaultModels(models, 'anthropic', hints);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe('claude-3-7-sonnet');
    });

    it('pattern that matches nothing adds nothing', () => {
      const models: ModelInfo[] = [
        { id: 'claude-3-5-sonnet', displayName: 'Claude 3.5 Sonnet', provider: 'anthropic', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
      ];
      const hints: ModelHints = {
        ...fixtureHints,
        defaultPatterns: { anthropic: ['nonexistent-model', 'sonnet'] },
      };
      const defaults = getDefaultModels(models, 'anthropic', hints);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe('claude-3-5-sonnet');
    });

    it('empty or all-unmatched patterns fall back to all likelyChat models', () => {
      const models: ModelInfo[] = [
        { id: 'chat-1', displayName: 'Chat 1', provider: 'anthropic', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
        { id: 'chat-2', displayName: 'Chat 2', provider: 'anthropic', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
        { id: 'embed-1', displayName: 'Embed 1', provider: 'anthropic', likelyChat: false, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
      ];

      // Empty pattern array
      const emptyDefaults = getDefaultModels(models, 'anthropic', { ...fixtureHints, defaultPatterns: { anthropic: [] } });
      expect(emptyDefaults.map((m) => m.id)).toEqual(['chat-1', 'chat-2']);

      // All unmatched patterns
      const unmatchedDefaults = getDefaultModels(models, 'anthropic', { ...fixtureHints, defaultPatterns: { anthropic: ['no-match-1', 'no-match-2'] } });
      expect(unmatchedDefaults.map((m) => m.id)).toEqual(['chat-1', 'chat-2']);
    });

    it('the default list keeps pattern order', () => {
      const models: ModelInfo[] = [
        { id: 'claude-3-haiku', displayName: 'Claude 3 Haiku', provider: 'anthropic', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: true },
        { id: 'claude-3-opus', displayName: 'Claude 3 Opus', provider: 'anthropic', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
        { id: 'claude-3-5-sonnet', displayName: 'Claude 3.5 Sonnet', provider: 'anthropic', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
      ];
      // pattern order is ['opus', 'sonnet', 'haiku']
      const defaults = getDefaultModels(models, 'anthropic', fixtureHints);
      expect(defaults.map((m) => m.id)).toEqual(['claude-3-opus', 'claude-3-5-sonnet', 'claude-3-haiku']);
    });

    it('the same model selected by two patterns appears once', () => {
      const models: ModelInfo[] = [
        { id: 'claude-multi-tag', displayName: 'Claude Fast Speedy', provider: 'anthropic', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
      ];
      const hints: ModelHints = {
        ...fixtureHints,
        defaultPatterns: { anthropic: ['fast', 'speedy'] },
      };
      const defaults = getDefaultModels(models, 'anthropic', hints);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe('claude-multi-tag');
    });

    it('a pattern matching only a non-chat model adds nothing', () => {
      const models: ModelInfo[] = [
        { id: 'claude-3-5-sonnet', displayName: 'Claude 3.5 Sonnet', provider: 'anthropic', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
        { id: 'claude-embed-v1', displayName: 'Claude Embed V1', provider: 'anthropic', likelyChat: false, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false },
      ];
      const hints: ModelHints = {
        ...fixtureHints,
        defaultPatterns: { anthropic: ['embed', 'sonnet'] },
      };
      const defaults = getDefaultModels(models, 'anthropic', hints);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe('claude-3-5-sonnet');
    });

    it('an older model with a -latest alias does not beat a newer numbered model', () => {
      const olderLatest: ModelInfo = {
        id: 'gemini-1.0-pro-latest',
        displayName: 'Gemini 1.0 Pro Latest',
        provider: 'gemini',
        likelyChat: true,
        supportsImages: 'unknown',
        supportsPdf: 'unknown',
        capabilitySource: 'none',
        smallTierGuess: false,
      };
      const newerNumbered: ModelInfo = {
        id: 'gemini-1.5-pro',
        displayName: 'Gemini 1.5 Pro',
        provider: 'gemini',
        likelyChat: true,
        supportsImages: 'unknown',
        supportsPdf: 'unknown',
        capabilitySource: 'none',
        smallTierGuess: false,
      };

      // Newer numbered model (1.5) must beat older model with -latest (1.0)
      expect(compareModelFreshness(olderLatest, newerNumbered)).toBeGreaterThan(0);
      expect(compareModelFreshness(newerNumbered, olderLatest)).toBeLessThan(0);

      const unnumberedLatest: ModelInfo = {
        id: 'gemini-pro-latest',
        displayName: 'Gemini Pro Latest',
        provider: 'gemini',
        likelyChat: true,
        supportsImages: 'unknown',
        supportsPdf: 'unknown',
        capabilitySource: 'none',
        smallTierGuess: false,
      };

      // Numbered model (1.5) beats unnumbered -latest alias (0.0)
      expect(compareModelFreshness(unnumberedLatest, newerNumbered)).toBeGreaterThan(0);
      expect(compareModelFreshness(newerNumbered, unnumberedLatest)).toBeLessThan(0);

      const hints: ModelHints = {
        ...fixtureHints,
        defaultPatterns: { gemini: ['pro'] },
      };
      const defaults = getDefaultModels([olderLatest, newerNumbered], 'gemini', hints);
      expect(defaults[0].id).toBe('gemini-1.5-pro');
    });

    it('freshness order: major, minor, date, latest, reverse alphanumeric display name', () => {
      // 1. Major version
      const v2: ModelInfo = { id: 'm-2', displayName: 'Model 2.0', provider: 'anthropic', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false };
      const v1Date: ModelInfo = { id: 'm-1-20250101-latest', displayName: 'Model 1.9 Latest', provider: 'anthropic', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false };
      expect(compareModelFreshness(v2, v1Date)).toBeLessThan(0);

      // 2. Minor version
      const v35: ModelInfo = { id: 'm-3-5', displayName: 'Model 3.5', provider: 'anthropic', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false };
      const v30: ModelInfo = { id: 'm-3-0', displayName: 'Model 3.0', provider: 'anthropic', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false };
      expect(compareModelFreshness(v35, v30)).toBeLessThan(0);

      // 3. 8-digit date in ID
      const dNewer: ModelInfo = { id: 'm-3-5-20250101', displayName: 'Model 3.5', provider: 'anthropic', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false };
      const dOlder: ModelInfo = { id: 'm-3-5-20241022', displayName: 'Model 3.5', provider: 'anthropic', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false };
      expect(compareModelFreshness(dNewer, dOlder)).toBeLessThan(0);

      // 4. "latest" tag when version and date match
      const withLatest: ModelInfo = { id: 'm-3-5-latest', displayName: 'Model 3.5 Latest', provider: 'anthropic', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false };
      const withoutLatest: ModelInfo = { id: 'm-3-5-plain', displayName: 'Model 3.5 Plain', provider: 'anthropic', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false };
      expect(compareModelFreshness(withLatest, withoutLatest)).toBeLessThan(0);

      // 5. Reverse alphanumeric order of display name
      const nameZ: ModelInfo = { id: 'm-z', displayName: 'Model Z', provider: 'anthropic', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false };
      const nameA: ModelInfo = { id: 'm-a', displayName: 'Model A', provider: 'anthropic', likelyChat: true, supportsImages: 'unknown', supportsPdf: 'unknown', capabilitySource: 'none', smallTierGuess: false };
      expect(compareModelFreshness(nameZ, nameA)).toBeLessThan(0);
    });

    it('Show all returns every model with recommended IDs first', () => {
      const raw: RawModelInput[] = [
        { id: 'claude-3-5-sonnet', displayName: 'Claude 3.5 Sonnet', provider: 'anthropic' },
        { id: 'claude-3-opus', displayName: 'Claude 3 Opus', provider: 'anthropic' },
        { id: 'claude-embed-v1', displayName: 'Claude Embed', provider: 'anthropic' },
        { id: 'claude-3-haiku', displayName: 'Claude 3 Haiku', provider: 'anthropic' },
      ];

      const enriched = filterAndEnrichModels(raw, 'anthropic', fixtureHints);
      // All 4 models returned, including non-chat embed
      expect(enriched).toHaveLength(4);
      // Recommended model (claude-3-opus) is first
      expect(enriched[0].id).toBe('claude-3-opus');
      // The rest are sorted alphabetically by displayName
      expect(enriched.slice(1).map((m) => m.displayName)).toEqual([
        'Claude 3 Haiku',
        'Claude 3.5 Sonnet',
        'Claude Embed',
      ]);
    });

    it('asserts no entry of defaultPatterns or smallTierIdPatterns appears as a string literal in src/ outside src/data/ (rule 8)', () => {
      const hintsPath = path.resolve(__dirname, '../../src/data/model-hints.json');
      const hints = JSON.parse(fs.readFileSync(hintsPath, 'utf8'));
      const patternsToCheck = new Set<string>([
        ...hints.smallTierIdPatterns,
        ...Object.values(hints.defaultPatterns as Record<string, string[]>).flat(),
      ]);

      function getSourceFiles(dir: string): string[] {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const files: string[] = [];
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== 'data') {
              files.push(...getSourceFiles(full));
            }
          } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
            files.push(full);
          }
        }
        return files;
      }

      const srcDir = path.resolve(__dirname, '../../src');
      const files = getSourceFiles(srcDir);
      const stringLiteralRegex = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;

      const violations: { file: string; literal: string; pattern: string }[] = [];

      for (const file of files) {
        const relFile = path.relative(srcDir, file);
        const content = fs.readFileSync(file, 'utf8');
        const literals = content.match(stringLiteralRegex) || [];
        for (const lit of literals) {
          const inner = lit.slice(1, -1).toLowerCase();
          for (const pat of patternsToCheck) {
            if (inner.includes(pat.toLowerCase())) {
              violations.push({ file: relFile, literal: lit, pattern: pat });
            }
          }
        }
      }

      expect(violations).toEqual([]);
    });
  });
});


