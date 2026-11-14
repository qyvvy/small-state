import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from 'bun:test'
import { makeMachine, makeRuntime, waitFor } from '../index'

describe('sample', () => {
  describe('formMachine', () => {
    type FormData = { title: string; description: string }
    const INITIAL_CONTEXT = { data: { title: '', description: '' }, error: null }

    let resolveMock!: (result: { result: string }) => void
    const mockFn = jest.fn((data: FormData) => new Promise<{ result: string }>((resolve) => {
      resolveMock = resolve
    }))

    const formMachine = makeMachine(
      {
        name: 'form',
        types: {
          context: {} as { data: FormData; error: string | null },
          events: {} as
            | { type: 'open' }
            | { type: 'cancel' }
            | { type: 'updateTitle'; value: string }
            | { type: 'updateDescription'; value: string }
            | { type: 'next' }
            | { type: 'back' }
            | { type: 'submit' },
        },
        guards: {
          validStep1: ({ c }) => c.data.title.trim().length > 0,
          validStep2: ({ c }) => c.data.description.trim().length > 0,
        },
        services: {
          postData: async (data: FormData) => {
            //await api.post(data)
            return mockFn(data)
          },
        },
        initContext: () => INITIAL_CONTEXT,
      },

      ({ on, subStates, invoke }) => ({
        idle: [on('open', { to: 'modal', actions: ({ update }) => update(INITIAL_CONTEXT) })],
        modal: [
          on('cancel', { to: 'idle' }),
          subStates({
            step1: [
              on('updateTitle', {
                actions: ({ update, e, c }) => update({ data: { ...c.data, title: e.value }, error: null }),
              }),
              on('next', [
                { guard: 'validStep1', to: 'step2', actions: ({ update }) => update({ error: null }) },
                { actions: ({ update }) => update({ error: 'Please enter a title.' }) },
              ]),
            ],
            step2: [
              on('updateDescription', {
                actions: ({ update, e, c }) => update({
                  data: { ...c.data, description: e.value }, error: null,
                }),
              }),
              on('back', { to: 'step1', actions: ({ update }) => update({ error: null }) }),
              on('submit', [
                { guard: 'validStep2', to: '/submitting', actions: ({ update }) => update({ error: null }) },
                { actions: ({ update }) => update({ error: 'Please enter a description.' }) },
              ]),
            ],
          }),
        ],
        submitting: [
          invoke(
            'postData',
            { input: ({ c }) => c.data },
            on(':done:', { to: 'idle' }),
            on(':error:', {
              to: '/modal/step2',
              actions: ({ update }) => update({ error: 'Failed to submit the post.' })
            }),
          ),
        ],
      }),
    )

    test('0:', async () => {
      const rt = makeRuntime(formMachine).start()
      expect(rt.stateValue).toBe('/idle')
      rt.send('open')
      expect(rt.stateValue).toBe('/modal/step1')
      rt.send({ type: 'updateTitle', value: 'Coffee' })
      expect(rt.context.data).toEqual({ title: 'Coffee', description: '' })

      rt.send('next')
      expect(rt.stateValue).toBe('/modal/step2')
      rt.send({ type: 'updateDescription', value: 'A popular beverage made from roasted coffee beans.' })
      expect(rt.context.data).toEqual({ title: 'Coffee', description: 'A popular beverage made from roasted coffee beans.' })
      rt.send('submit')

      expect(rt.stateValue).toBe('/submitting')
      resolveMock({ result: 'succeeded' })
      await waitFor(rt, (ss) => ss.stateValue !== 'submitting')

      expect(mockFn).toHaveBeenCalledWith({ title: 'Coffee', description: 'A popular beverage made from roasted coffee beans.' })
      expect(rt.stateValue).toBe('/idle')
    })
  })
})
