import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConnectorKeyDto, CreatedConnectorKeyDto } from "../../../../shared/api-types";
import { describeError, fieldError } from "../../api/client";
import { api, queryKeys } from "../../api/endpoints";
import { Can, useAuth } from "../../auth/AuthProvider";
import { AsyncView } from "../../components/AsyncView";
import { Badge } from "../../components/Badge";
import { Dialog } from "../../components/Dialog";
import { Field } from "../../components/Field";
import { useNotice } from "../../hooks/useNotice";
import { SITE_URL } from "../../lib/site";

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "Never";
}

/** The screenshot kit (house markup tool) lives on the published guide site. */
const KIT_BASE = `${SITE_URL.replace(/\/+$/, '')}/editor-kit`;
const KIT_INSTALL = `curl -fsSL ${KIT_BASE}/install.sh | BE_GUIDED_KIT_URL=${KIT_BASE} bash`;

/** The one-time view of a new key, with copy-paste setup for Claude Code and Codex. */
function KeyCreated({ created, onClose }: { created: CreatedConnectorKeyDto; onClose: () => void }) {
  const { notify } = useNotice();
  const claude = `claude mcp add --scope user --transport http be-guided ${created.connectorUrl} --header "Authorization: Bearer ${created.key}"`;
  const codex = [
    "[mcp_servers.be-guided]",
    `url = "${created.connectorUrl}"`,
    `http_headers = { Authorization = "Bearer ${created.key}" }`,
  ].join("\n");
  const copy = (text: string, what: string) => {
    void navigator.clipboard.writeText(text).then(
      () => notify("success", `${what} copied.`),
      () => notify("error", "Couldn't copy. Select the text and copy it instead."),
    );
  };
  return (
    <Dialog
      open
      title={`Key for ${created.personName}`}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn--primary" onClick={onClose}>
          I've copied it
        </button>
      }
    >
      <div className="stack">
        <p>
          <strong>Copy this now.</strong> It is shown only once. Send it to {created.personName} privately (not by
          email to a group). If it is lost or leaked, switch it off and make a new one.
        </p>
        <div className="key-box">
          <code>{created.key}</code>
          <button type="button" className="btn btn--small" onClick={() => copy(created.key, "Key")}>
            Copy key
          </button>
        </div>
        <h3>Claude Code: run this once in a terminal</h3>
        <div className="key-box">
          <code>{claude}</code>
          <button type="button" className="btn btn--small" onClick={() => copy(claude, "Claude Code command")}>
            Copy
          </button>
        </div>
        <h3>Codex: add this to ~/.codex/config.toml</h3>
        <div className="key-box">
          <pre>{codex}</pre>
          <button type="button" className="btn btn--small" onClick={() => copy(codex, "Codex settings")}>
            Copy
          </button>
        </div>
        <h3>Screenshots: run this once too (Claude Code and Codex)</h3>
        <p className="muted small">Gives their AI the house screenshot look: sharp, orange numbered boxes. Needs Node.js 18 or newer.</p>
        <div className="key-box">
          <code>{KIT_INSTALL}</code>
          <button type="button" className="btn btn--small" onClick={() => copy(KIT_INSTALL, "Screenshot kit command")}>
            Copy
          </button>
        </div>
        <p className="muted small">
          Then they ask their AI, for example: &ldquo;Using Be Guided, update the Leave guide in Acme Books for the
          new approval screen.&rdquo; It will ask them for the content mode and product first.
        </p>
      </div>
    </Dialog>
  );
}

function NewKeyDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (k: CreatedConnectorKeyDto) => void }) {
  const qc = useQueryClient();
  const people = useQuery({ queryKey: queryKeys.people, queryFn: ({ signal }) => api.getPeople(signal) });
  const library = useQuery({ queryKey: queryKeys.library, queryFn: ({ signal }) => api.getLibrary(signal) });
  const [personId, setPersonId] = useState("");
  const [label, setLabel] = useState("");
  const [allProducts, setAllProducts] = useState(true);
  const [products, setProducts] = useState<string[]>([]);
  const create = useMutation({
    mutationFn: () => api.createConnectorKey({ personId, label, products: allProducts ? null : products }),
    onSuccess: (k) => {
      void qc.invalidateQueries({ queryKey: queryKeys.connectorKeys });
      onCreated(k);
    },
  });
  const writers = (people.data ?? []).filter((p) => p.active && p.role !== "viewer");
  return (
    <Dialog
      open
      title="New connector key"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!personId || !label.trim() || (!allProducts && products.length === 0) || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Creating…" : "Create key"}
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label="Person" error={fieldError(create.error, "personId")} hint="Editors and owners only. Add people in Settings › People first.">
          {(p) => (
            <select {...p} value={personId} onChange={(e) => setPersonId(e.target.value)}>
              <option value="">Choose a person</option>
              {writers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.role})
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Name for this key" error={fieldError(create.error, "label")} hint="So you can recognise it later, e.g. “Dana's laptop”.">
          {(p) => <input {...p} value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />}
        </Field>
        <fieldset className="radio-set">
          <legend>Products this key can update</legend>
          <label>
            <input type="radio" name="scope" checked={allProducts} onChange={() => setAllProducts(true)} />
            <span>All products</span>
          </label>
          <label>
            <input type="radio" name="scope" checked={!allProducts} onChange={() => setAllProducts(false)} />
            <span>Only these:</span>
          </label>
          {!allProducts
            ? (library.data?.products ?? []).map((p) => (
                <label key={p.slug} className="indent">
                  <input
                    type="checkbox"
                    checked={products.includes(p.slug)}
                    onChange={(e) => setProducts(e.target.checked ? [...products, p.slug] : products.filter((x) => x !== p.slug))}
                  />
                  <span>{p.meta.name}</span>
                </label>
              ))
            : null}
        </fieldset>
        {create.isError && !fieldError(create.error, "personId") && !fieldError(create.error, "label") ? (
          <p className="field__error" role="alert">
            {describeError(create.error)}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/** Settings › Connector: personal keys for updating the guide from Claude Code or Codex. */
export function ConnectorPanel() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const { notify } = useNotice();
  const keys = useQuery({ queryKey: queryKeys.connectorKeys, queryFn: ({ signal }) => api.getConnectorKeys(signal), enabled: can("people:manage") });
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedConnectorKeyDto | null>(null);
  const [toRevoke, setToRevoke] = useState<ConnectorKeyDto | null>(null);
  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeConnectorKey(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.connectorKeys });
      notify("success", "Key switched off. It stops working at once.");
    },
    onError: (e) => notify("error", describeError(e)),
  });

  return (
    <section className="panel stack" aria-labelledby="connector-h">
      <div className="panel__head">
        <div>
          <h2 id="connector-h">Editor connector</h2>
          <p className="muted">
            Let people update the guide from Claude Code or Codex. Each person gets their own key. They can change guide
            content only (pages, screenshots, video requests), never the site or settings. Whether their changes need
            your approval is set per product in Products.
          </p>
        </div>
        <Can permission="people:manage">
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            + New key
          </button>
        </Can>
      </div>
      {!can("people:manage") ? (
        <p className="muted">Only owners can see and create keys.</p>
      ) : (
        <AsyncView query={keys} isEmpty={(d) => d.length === 0} empty="No keys yet. Create one for each person who should update the guide.">
          {(list) => (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col">Key</th>
                    <th scope="col">Products</th>
                    <th scope="col">Last used</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((k) => (
                    <tr key={k.id}>
                      <th scope="row">{k.personName}</th>
                      <td>
                        {k.label} <span className="muted small">({k.prefix}…)</span>
                      </td>
                      <td>{k.products ? k.products.join(", ") : "All"}</td>
                      <td>{when(k.lastUsedAt)}</td>
                      <td>{k.revokedAt ? <Badge tone="neutral">Switched off</Badge> : <Badge tone="live">Active</Badge>}</td>
                      <td className="data-table__actions">
                        {!k.revokedAt ? (
                          <button
                            type="button"
                            className="btn btn--small btn--ghost"
                            disabled={revoke.isPending}
                            onClick={() => setToRevoke(k)}
                          >
                            Switch off
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AsyncView>
      )}
      {creating ? (
        <NewKeyDialog
          onClose={() => setCreating(false)}
          onCreated={(k) => {
            setCreating(false);
            setCreated(k);
          }}
        />
      ) : null}
      {created ? <KeyCreated created={created} onClose={() => setCreated(null)} /> : null}
      {toRevoke ? (
        <Dialog
          open
          title="Switch off this key?"
          onClose={() => setToRevoke(null)}
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setToRevoke(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={revoke.isPending}
                onClick={() => {
                  revoke.mutate(toRevoke.id);
                  setToRevoke(null);
                }}
              >
                Switch off
              </button>
            </>
          }
        >
          <p>
            “{toRevoke.label}” for {toRevoke.personName} stops working at once.
          </p>
        </Dialog>
      ) : null}
    </section>
  );
}
