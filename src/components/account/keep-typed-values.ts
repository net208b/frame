import { startTransition, type FormEvent } from 'react';

/**
 * Submit a form to its action without React clearing what was typed.
 *
 * React 19 resets every uncontrolled field once a `<form action={…}>`
 * submission finishes — whether the action succeeded or refused. For a sign-in
 * form that is a nuisance; for a profile editor it is data loss: a member who
 * changes five fields and mistypes one gets all five put back.
 *
 * The reset only follows a submission React itself dispatched. So with
 * JavaScript running, this intercepts the submit and calls the action directly,
 * and nothing is reset. Without JavaScript — before hydration — the form's own
 * `action` still posts natively, which is why both are set:
 *
 *     <form action={formAction} onSubmit={keepTypedValues(formAction)}>
 *
 * The pressed button is passed to FormData so a button's name and value travel
 * as they would in a native submission.
 */
export function keepTypedValues(formAction: (data: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => formAction(data));
  };
}
