'use client';

import { useEffect, useRef, useState } from 'react';
import { FormField } from '@/components/form/form-field';
import { Button } from '@/components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { loadVehicleModelOptions } from '../actions';
import { withRetired, type CatalogOption } from '../_lib/catalog-options';

type ModelsState =
  | { status: 'ready'; options: CatalogOption[] }
  | { status: 'loading' }
  | { status: 'error'; message: string };

type Props = {
  /** Options for the Make select (active makes, or all for a filter). */
  makes: CatalogOption[];
  initialMakeId: string;
  initialModelId: string;
  /**
   * Models of `initialMakeId`, loaded by the server. Leave it out when the
   * make was chosen on the client (for example after a failed submit): the
   * component then loads them once.
   */
  initialModels: CatalogOption[] | undefined;
  /** The saved make and model, kept visible and selectable if retired. */
  currentMake?: CatalogOption;
  currentModel?: CatalogOption;
  /** Whether the models loaded on a make change include retired ones. */
  includeInactive: boolean;
  required: boolean;
  makePlaceholder: string;
  modelPlaceholder: string;
  makeErrors?: string[];
  modelErrors?: string[];
};

/**
 * Dependent Make and Model selects. The model list belongs to the chosen
 * make: it is disabled until a make is chosen, cleared when the make changes
 * and reloaded through a Server Action. The API stays the authority on whether
 * the model belongs to the make; this only prevents the obvious mistake.
 */
export function MakeModelFields({
  makes,
  initialMakeId,
  initialModelId,
  initialModels,
  currentMake,
  currentModel,
  includeInactive,
  required,
  makePlaceholder,
  modelPlaceholder,
  makeErrors,
  modelErrors,
}: Props) {
  const [makeId, setMakeId] = useState(initialMakeId);
  const [modelId, setModelId] = useState(initialModelId);
  const [models, setModels] = useState<ModelsState>(
    initialModels !== undefined || initialMakeId === ''
      ? { status: 'ready', options: initialModels ?? [] }
      : { status: 'loading' },
  );
  const latestRequest = useRef(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const [resets, setResets] = useState(0);

  // React resets the form after a Server Action, and a reset puts the DOM
  // selects back to their first option while this component still holds the
  // chosen values. Rendering fresh selects (new keys) re-applies the state.
  useEffect(() => {
    const form = wrapper.current?.closest('form');
    if (!form) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The reset event fires before the reset itself, so wait one tick.
    const onReset = () => {
      timer = setTimeout(() => setResets((count) => count + 1), 0);
    };
    form.addEventListener('reset', onReset);
    return () => {
      form.removeEventListener('reset', onReset);
      clearTimeout(timer);
    };
  }, []);

  async function fetchModels(forMakeId: string) {
    const request = ++latestRequest.current;
    const result = await loadVehicleModelOptions(forMakeId, includeInactive);
    // A newer make choice supersedes this answer.
    if (request !== latestRequest.current) return;
    setModels(
      'error' in result
        ? { status: 'error', message: result.error }
        : { status: 'ready', options: result.options },
    );
  }

  useEffect(() => {
    if (initialMakeId !== '' && initialModels === undefined) {
      void fetchModels(initialMakeId);
    }
    // Runs once on mount; later loads come from the make's change handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeMake(nextMakeId: string) {
    setMakeId(nextMakeId);
    setModelId('');
    if (nextMakeId === '') {
      latestRequest.current += 1;
      setModels({ status: 'ready', options: [] });
      return;
    }
    setModels({ status: 'loading' });
    void fetchModels(nextMakeId);
  }

  function retry() {
    setModels({ status: 'loading' });
    void fetchModels(makeId);
  }

  const makeOptions = withRetired(makes, currentMake);
  const modelOptions =
    models.status === 'ready'
      ? withRetired(
          models.options,
          currentMake !== undefined && currentMake.id === makeId
            ? currentModel
            : undefined,
        )
      : [];
  const noModels =
    makeId !== '' && models.status === 'ready' && modelOptions.length === 0;
  const modelDisabled =
    makeId === '' || models.status !== 'ready' || modelOptions.length === 0;

  return (
    <div ref={wrapper} className="contents">
      <FormField name="makeId" label="Make" errors={makeErrors}>
        {(props) => (
          <NativeSelect
            {...props}
            key={`make-${resets}`}
            name="makeId"
            required={required}
            value={makeId}
            onChange={(event) => changeMake(event.target.value)}
          >
            <NativeSelectOption value="">{makePlaceholder}</NativeSelectOption>
            {makeOptions.map((option) => (
              <NativeSelectOption key={option.id} value={option.id}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </FormField>

      <div className="space-y-1.5">
        <FormField name="modelId" label="Model" errors={modelErrors}>
          {(props) => (
            <NativeSelect
              {...props}
              key={`model-${resets}`}
              name="modelId"
              required={required}
              disabled={modelDisabled}
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
            >
              <NativeSelectOption value="">
                {modelPlaceholder}
              </NativeSelectOption>
              {modelOptions.map((option) => (
                <NativeSelectOption key={option.id} value={option.id}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FormField>
        {makeId === '' ? (
          <p className="text-muted-foreground text-sm">
            Choose a make to see its models.
          </p>
        ) : null}
        {models.status === 'loading' ? (
          <p role="status" className="text-muted-foreground text-sm">
            Loading models…
          </p>
        ) : null}
        {noModels ? (
          <p role="status" className="text-muted-foreground text-sm">
            This make has no models
          </p>
        ) : null}
        {models.status === 'error' ? (
          <div role="alert" className="text-destructive text-sm">
            <p>{models.message}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-1"
              onClick={retry}
            >
              Try again
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
