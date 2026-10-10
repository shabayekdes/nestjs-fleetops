// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadVehicleModelOptions = vi.hoisted(() => vi.fn());
vi.mock('../actions', () => ({ loadVehicleModelOptions }));

import { MakeModelFields } from './make-model-fields';

const toyota = { id: 'make-1', name: 'Toyota' };
const ford = { id: 'make-2', name: 'Ford' };
const corolla = { id: 'model-1', name: 'Corolla' };

type Props = Parameters<typeof MakeModelFields>[0];

function setup(props: Partial<Props> = {}) {
  return render(
    <MakeModelFields
      makes={[toyota, ford]}
      initialMakeId=""
      initialModelId=""
      initialModels={[]}
      includeInactive={false}
      required
      makePlaceholder="Choose a make"
      modelPlaceholder="Choose a model"
      {...props}
    />,
  );
}

function labels(select: HTMLElement) {
  return within(select)
    .getAllByRole('option')
    .map((option) => option.textContent);
}

beforeEach(() => {
  loadVehicleModelOptions.mockReset();
  loadVehicleModelOptions.mockResolvedValue({ options: [corolla] });
});

describe('MakeModelFields', () => {
  it('disables the Model until a make is chosen', () => {
    setup();
    expect(screen.getByLabelText('Model')).toBeDisabled();
    expect(
      screen.getByText('Choose a make to see its models.'),
    ).toBeInTheDocument();
    expect(loadVehicleModelOptions).not.toHaveBeenCalled();
  });

  it('loads the models of the chosen make and enables the Model', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Make'), {
      target: { value: 'make-1' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('Loading models…');
    expect(screen.getByLabelText('Model')).toBeDisabled();
    await waitFor(() => expect(screen.getByLabelText('Model')).toBeEnabled());
    expect(loadVehicleModelOptions).toHaveBeenCalledWith('make-1', false);
    expect(labels(screen.getByLabelText('Model'))).toEqual([
      'Choose a model',
      'Corolla',
    ]);
  });

  it('asks for retired models when includeInactive is set', async () => {
    setup({ includeInactive: true, required: false });
    fireEvent.change(screen.getByLabelText('Make'), {
      target: { value: 'make-1' },
    });
    await waitFor(() => expect(screen.getByLabelText('Model')).toBeEnabled());
    expect(loadVehicleModelOptions).toHaveBeenCalledWith('make-1', true);
    expect(screen.getByLabelText('Make')).not.toBeRequired();
  });

  it('clears the selected model when the make changes', async () => {
    setup({
      initialMakeId: 'make-1',
      initialModelId: 'model-1',
      initialModels: [corolla],
    });
    expect(screen.getByLabelText('Model')).toHaveValue('model-1');
    fireEvent.change(screen.getByLabelText('Make'), {
      target: { value: 'make-2' },
    });
    expect(screen.getByLabelText('Model')).toHaveValue('');
    await waitFor(() => expect(screen.getByLabelText('Model')).toBeEnabled());
    expect(screen.getByLabelText('Model')).toHaveValue('');
  });

  it('clears and disables the Model when the make is unset', () => {
    setup({
      initialMakeId: 'make-1',
      initialModelId: 'model-1',
      initialModels: [corolla],
    });
    fireEvent.change(screen.getByLabelText('Make'), { target: { value: '' } });
    expect(screen.getByLabelText('Model')).toHaveValue('');
    expect(screen.getByLabelText('Model')).toBeDisabled();
    expect(loadVehicleModelOptions).not.toHaveBeenCalled();
  });

  it('ignores the answer of a make that is no longer chosen', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    loadVehicleModelOptions
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockResolvedValueOnce({ options: [{ id: 'model-2', name: 'Focus' }] });
    setup();
    const make = screen.getByLabelText('Make');
    fireEvent.change(make, { target: { value: 'make-1' } });
    fireEvent.change(make, { target: { value: 'make-2' } });
    await waitFor(() => expect(screen.getByLabelText('Model')).toBeEnabled());
    resolveFirst({ options: [corolla] });
    await Promise.resolve();
    expect(labels(screen.getByLabelText('Model'))).toEqual([
      'Choose a model',
      'Focus',
    ]);
  });

  it('shows the empty state for a make without models', async () => {
    loadVehicleModelOptions.mockResolvedValue({ options: [] });
    setup();
    fireEvent.change(screen.getByLabelText('Make'), {
      target: { value: 'make-1' },
    });
    expect(await screen.findByText('This make has no models')).toBeVisible();
    expect(screen.getByLabelText('Model')).toBeDisabled();
  });

  it('shows the error with a retry that loads again', async () => {
    loadVehicleModelOptions
      .mockResolvedValueOnce({ error: 'The service is unavailable.' })
      .mockResolvedValueOnce({ options: [corolla] });
    setup();
    fireEvent.change(screen.getByLabelText('Make'), {
      target: { value: 'make-1' },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The service is unavailable.',
    );
    expect(screen.getByLabelText('Model')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByLabelText('Model')).toBeEnabled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('loads on mount when the initial models are not provided', async () => {
    setup({
      initialMakeId: 'make-1',
      initialModelId: 'model-1',
      initialModels: undefined,
    });
    expect(screen.getByLabelText('Model')).toBeDisabled();
    await waitFor(() => expect(screen.getByLabelText('Model')).toBeEnabled());
    expect(loadVehicleModelOptions).toHaveBeenCalledWith('make-1', false);
    expect(screen.getByLabelText('Model')).toHaveValue('model-1');
  });

  it('keeps a retired current make and model visible and selected', () => {
    setup({
      initialMakeId: 'make-old',
      initialModelId: 'model-old',
      initialModels: [],
      currentMake: { id: 'make-old', name: 'Saab' },
      currentModel: { id: 'model-old', name: '9-3' },
    });
    const make = screen.getByLabelText('Make');
    const model = screen.getByLabelText('Model');
    expect(make).toHaveValue('make-old');
    expect(within(make).getByText('Saab (retired)')).toBeInTheDocument();
    expect(model).toHaveValue('model-old');
    expect(within(model).getByText('9-3 (retired)')).toBeInTheDocument();
    expect(model).toBeEnabled();
    expect(screen.queryByText('This make has no models')).toBeNull();
  });

  it('does not offer the retired current model under another make', async () => {
    setup({
      initialMakeId: 'make-old',
      initialModelId: 'model-old',
      initialModels: [],
      currentMake: { id: 'make-old', name: 'Saab' },
      currentModel: { id: 'model-old', name: '9-3' },
    });
    fireEvent.change(screen.getByLabelText('Make'), {
      target: { value: 'make-1' },
    });
    await waitFor(() => expect(screen.getByLabelText('Model')).toBeEnabled());
    expect(labels(screen.getByLabelText('Model'))).toEqual([
      'Choose a model',
      'Corolla',
    ]);
  });

  it('shows field errors on the matching selects', () => {
    setup({ makeErrors: ['Choose a make'], modelErrors: ['Choose a model'] });
    expect(screen.getByLabelText('Make')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText('Model')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });
});
