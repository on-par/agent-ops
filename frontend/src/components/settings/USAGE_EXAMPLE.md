# Provider Settings Components - Usage Guide

This directory contains three components for managing LLM provider settings:

## Components

### 1. ConnectionStatus
Displays the current connection status with visual indicators.

```tsx
import { ConnectionStatus } from './components/settings';

<ConnectionStatus
  status="connected"
  latencyMs={234}
  modelName="llama2"
/>
```

Props:
- `status`: 'idle' | 'testing' | 'connected' | 'error'
- `latencyMs?`: number - Shows when status is 'connected'
- `error?`: string - Shows when status is 'error'
- `modelName?`: string - Shows in connected status text

### 2. ModelSelector
Dropdown to select from available models for a provider.

```tsx
import { ModelSelector } from './components/settings';

<ModelSelector
  providerType="ollama"
  baseUrl="http://localhost:11434"
  value={selectedModel}
  onChange={setSelectedModel}
/>
```

Props:
- `providerType?`: ProviderType - Required to fetch models
- `baseUrl?`: string - For providers that need it (Ollama)
- `apiKey?`: string - For providers that need it (OpenAI, Anthropic, OpenRouter)
- `value?`: string - Currently selected model ID
- `onChange`: (modelId: string) => void
- `disabled?`: boolean

### 3. ProviderSettings (Main Component)
Complete form for creating/editing provider settings.

```tsx
import { ProviderSettings } from './components/settings';

// For creating new settings
<ProviderSettings
  onSave={() => console.log('Settings saved')}
/>

// For editing existing settings
<ProviderSettings
  existingSettings={providerData}
  onSave={() => console.log('Settings updated')}
  onDelete={() => console.log('Settings deleted')}
/>
```

Props:
- `existingSettings?`: ProviderSettings - Pass to edit existing settings
- `onSave?`: () => void - Callback after successful save
- `onDelete?`: () => void - Callback after successful delete

## Integration Example in Settings Page

Add a new section to Settings.tsx:

```tsx
import { ProviderSettings } from "../components/settings";

// Add to settingsSections array:
{
  id: "llm-providers",
  title: "LLM Providers",
  description: "Configure AI model providers",
  icon: Bot,
  color: "var(--violet)",
}

// Add to content area:
{activeSection === "llm-providers" && (
  <SettingSection title="LLM Provider Configuration">
    <div className="py-4">
      <ProviderSettings
        onSave={() => {
          // Optionally show success message
          console.log('Provider settings saved');
        }}
      />
    </div>
  </SettingSection>
)}
```

## Features

### ProviderSettings Component Features:
- Provider type selection (Ollama, OpenAI, Anthropic, OpenRouter)
- Dynamic form fields based on provider:
  - Ollama: Base URL + Model Selection
  - OpenAI/Anthropic/OpenRouter: API Key + Model Selection
- Connection testing with real-time status
- Model selection dropdown (disabled until connection succeeds)
- Set as default provider toggle
- Save/Update/Delete with loading states
- Delete confirmation dialog
- Comprehensive validation
- Error handling with user-friendly messages

### Styling
- Matches existing Settings.tsx patterns
- Uses CSS variables for theming
- Tailwind CSS utility classes
- Lucide icons for consistency
- Smooth transitions and animations

## API Integration

The components use these React Query hooks from `/hooks/use-provider-settings.ts`:
- `useAvailableModels()` - Fetch models for a provider
- `useTestConnection()` - Test provider connection
- `useCreateProviderSettings()` - Create new settings
- `useUpdateProviderSettings()` - Update existing settings
- `useDeleteProviderSettings()` - Delete settings
- `useSetDefaultProviderSettings()` - Set as default

## Validation Rules

- Provider type is required
- Base URL required for Ollama
- API key required for OpenAI/Anthropic/OpenRouter (on create)
- Model must be selected
- Connection must be tested successfully before saving

## User Flow

1. Select provider type
2. Enter credentials (Base URL for Ollama, API Key for others)
3. Click "Test Connection"
4. Connection status updates (testing → connected/error)
5. If connected, model dropdown becomes enabled
6. Select a model from the dropdown
7. Optionally toggle "Set as Default"
8. Click "Save Settings" (enabled only when all validation passes)

## Error Handling

- Network errors during model fetch show error state in ModelSelector
- Connection test failures show error status with message
- Save/Update/Delete errors show below action buttons
- All async operations have loading states
- Validation errors show inline below each field
