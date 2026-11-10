import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ROLE_LABEL,
  ROLES,
  type MeDto,
  type PersonDto,
  type Role,
} from "../../../../shared/api-types";
import { describeError, fieldError } from "../../api/client";
import { api, queryKeys } from "../../api/endpoints";
import { Can, useAuth } from "../../auth/AuthProvider";
import { AsyncView } from "../../components/AsyncView";
import { Badge } from "../../components/Badge";
import { Dialog } from "../../components/Dialog";
import { Field } from "../../components/Field";
import { Switch } from "../../components/Switch";
import { useNotice } from "../../hooks/useNotice";

const ROLE_HINT: Record<Role, string> = {
  owner: "Everything, including people, settings and publishing.",
  editor: "Pages, products, uploads and requests.",
  viewer: "Can look, but not change anything.",
};

interface Draft {
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

function PersonDialog({
  person,
  onClose,
}: {
  person: PersonDto | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { notify } = useNotice();
  const [d, setD] = useState<Draft>(() => ({
    name: person?.name ?? "",
    email: person?.email ?? "",
    role: person?.role ?? "editor",
    active: person?.active ?? true,
  }));
  const save = useMutation({
    mutationFn: () =>
      person
        ? api.updatePerson(person.id, d)
        : api.createPerson({ name: d.name, email: d.email, role: d.role }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: queryKeys.people });
      void qc.invalidateQueries({ queryKey: queryKeys.me });
      notify("success", r.message || (person ? "Saved." : `${d.name.trim()} added.`));
      onClose();
    },
  });
  return (
    <Dialog
      open
      title={person ? `Change ${person.name}` : "Add a person"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!d.name.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : person ? "Save" : "Add person"}
          </button>
        </>
      }
    >
      <div className="stack">
        <Field
          label="Name"
          error={fieldError(save.error, "name")}
          hint="Shown as the author on pages and in the audit log."
        >
          {(p) => (
            <input
              {...p}
              autoFocus
              value={d.name}
              onChange={(e) => setD({ ...d, name: e.target.value })}
            />
          )}
        </Field>
        <Field
          label="Email (optional)"
          error={fieldError(save.error, "email")}
          hint="Needed when Be Guided is online: it is how they sign in."
        >
          {(p) => (
            <input
              {...p}
              type="email"
              value={d.email}
              onChange={(e) => setD({ ...d, email: e.target.value })}
            />
          )}
        </Field>
        <fieldset className="radio-set">
          <legend>Role</legend>
          {ROLES.map((r) => (
            <label key={r}>
              <input
                type="radio"
                name="role"
                checked={d.role === r}
                onChange={() => setD({ ...d, role: r })}
              />
              <span>
                <strong>{ROLE_LABEL[r]}</strong>{" "}
                <span className="muted small">— {ROLE_HINT[r]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {person ? (
          <Switch
            label="Active"
            checked={d.active}
            onChange={(active) => setD({ ...d, active })}
            hint="Switched off people stay in the history but can’t be chosen as author or sign in."
          />
        ) : null}
        {save.isError &&
        !fieldError(save.error, "name") &&
        !fieldError(save.error, "email") ? (
          <p className="field__error" role="alert">
            {describeError(save.error)}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/** "Who is using this computer" (local admin only). Changes straight away; it is not part of the site settings draft. */
function CurrentPerson({ people, me }: { people: PersonDto[]; me: MeDto }) {
  const qc = useQueryClient();
  const { notify } = useNotice();
  const [chosen, setChosen] = useState(me.person?.id ?? "");
  const set = useMutation({
    mutationFn: () => api.setCurrentPerson(chosen || null),
    onSuccess: (next) => {
      qc.setQueryData(queryKeys.me, next);
      notify(
        "success",
        next.person
          ? `${next.person.name} is now using this computer.`
          : "Cleared.",
      );
    },
    onError: (e) => notify("error", describeError(e)),
  });
  const active = people.filter((p) => p.active);
  return (
    <div className="current-person">
      <Field
        label="Who is using this computer?"
        hint="Their name goes on page history and the audit log for changes made here."
      >
        {(p) => (
          <select
            {...p}
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
          >
            <option value="">No one chosen</option>
            {active.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <button
        type="button"
        className="btn"
        disabled={set.isPending || chosen === (me.person?.id ?? "")}
        onClick={() => set.mutate()}
      >
        {set.isPending ? "Saving…" : "Use this person"}
      </button>
    </div>
  );
}

/** Settings › People: who writes and publishes, their roles, and who is at this computer. */
export function PeoplePanel() {
  const { me, can } = useAuth();
  const people = useQuery({
    queryKey: queryKeys.people,
    queryFn: ({ signal }) => api.getPeople(signal),
  });
  const [editing, setEditing] = useState<PersonDto | null | "new">(null);
  return (
    <section className="panel stack" aria-labelledby="people-h">
      <div className="panel__head">
        <div>
          <h2 id="people-h">People</h2>
          <p className="muted">
            The people who write and publish. Pages pick their author from this
            list. Changes here save straight away.
          </p>
          {me?.mode === "cloud" ? (
            <p className="muted small">
              Adding someone with their email is the invite: send them this
              admin's address, they type their email and the code they are
              emailed. Switching someone off stops their sign-in.
            </p>
          ) : null}
        </div>
        <Can permission="people:manage">
          <button
            type="button"
            className="btn"
            onClick={() => setEditing("new")}
          >
            + Add a person
          </button>
        </Can>
      </div>
      <AsyncView
        query={people}
        isEmpty={(d) => d.length === 0}
        empty="No people yet. Add the people who write and publish the guide."
      >
        {(list) => (
          <>
            {me.mode === "local" && can("settings:manage") ? (
              <CurrentPerson people={list} me={me} />
            ) : null}
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Email</th>
                    <th scope="col">Role</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => (
                    <tr key={p.id}>
                      <th scope="row">
                        {p.name}
                        {me.person?.id === p.id ? (
                          <span className="muted small"> (you)</span>
                        ) : null}
                      </th>
                      <td>{p.email ?? <span className="muted">—</span>}</td>
                      <td>{ROLE_LABEL[p.role]}</td>
                      <td>
                        {p.active ? (
                          <Badge tone="live">Active</Badge>
                        ) : (
                          <Badge tone="neutral">Switched off</Badge>
                        )}
                      </td>
                      <td className="data-table__actions">
                        {can("people:manage") ? (
                          <button
                            type="button"
                            className="btn btn--small btn--ghost"
                            onClick={() => setEditing(p)}
                            aria-label={`Change ${p.name}`}
                          >
                            Change
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </AsyncView>
      {editing ? (
        <PersonDialog
          person={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </section>
  );
}
