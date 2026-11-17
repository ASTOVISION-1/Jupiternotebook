import sys
import json
import io
import ast
import traceback
import contextlib
import html as html_lib

namespace = {}
display_queue = []

class RichHtml:
    def __init__(self, content):
        self.content = content
    def _repr_html_(self):
        return self.content

class RichSvg:
    def __init__(self, content):
        self.content = content
    def _repr_svg_(self):
        return self.content

def HTML(content):
    return RichHtml(str(content))

def SVG(content):
    return RichSvg(str(content))

def display(*objs):
    for obj in objs:
        data = {}
        if hasattr(obj, "_repr_svg_") and callable(obj._repr_svg_):
            data["image/svg+xml"] = str(obj._repr_svg_())
        if hasattr(obj, "_repr_html_") and callable(obj._repr_html_):
            data["text/html"] = str(obj._repr_html_())
        data["text/plain"] = repr(obj)
        display_queue.append(data)

def table(rows, headers=None):
    if not rows:
        return RichHtml("<p>Empty table</p>")
    if headers is None and isinstance(rows[0], dict):
        headers = list(rows[0].keys())
        body_rows = [[r.get(h, "") for h in headers] for r in rows]
    else:
        body_rows = rows
    parts = ["<table>"]
    if headers:
        parts.append("<thead><tr>" + "".join(f"<th>{html_lib.escape(str(h))}</th>" for h in headers) + "</tr></thead>")
    parts.append("<tbody>")
    for row in body_rows:
        parts.append("<tr>" + "".join(f"<td>{html_lib.escape(str(cell))}</td>" for cell in row) + "</tr>")
    parts.append("</tbody></table>")
    return RichHtml("".join(parts))

def _init_namespace():
    namespace.clear()
    namespace["__name__"] = "__main__"
    namespace["HTML"] = HTML
    namespace["SVG"] = SVG
    namespace["display"] = display
    namespace["table"] = table

_init_namespace()

BUILTINS_HIDE = {"__name__", "__builtins__", "HTML", "SVG", "display", "table"}

def _format_value(val):
    try:
        r = repr(val)
        if len(r) > 120:
            return r[:117] + "..."
        return r
    except Exception:
        return "<unprintable>"

def _get_variables():
    items = []
    for k, v in namespace.items():
        if k.startswith("_") or k in BUILTINS_HIDE:
            continue
        tname = type(v).__name__
        if tname == "module":
            tname = "module"
        size_str = ""
        try:
            if hasattr(v, "__len__") and not isinstance(v, type):
                size_str = f"{len(v)} items"
        except Exception:
            pass
        items.append({
            "name": k,
            "type": tname,
            "valuePreview": _format_value(v),
            "size": size_str,
        })
    return items

def _execute_code(code):
    display_queue.clear()
    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()
    outputs = []
    error_obj = None

    with contextlib.redirect_stdout(stdout_buf), contextlib.redirect_stderr(stderr_buf):
        try:
            tree = ast.parse(code, mode="exec")
            last_expr = None
            if tree.body and isinstance(tree.body[-1], ast.Expr):
                last_expr = ast.Expression(body=tree.body.pop().value)
                ast.fix_missing_locations(last_expr)

            if tree.body:
                compiled_exec = compile(tree, "<cell>", "exec")
                exec(compiled_exec, namespace, namespace)

            if last_expr is not None:
                compiled_eval = compile(last_expr, "<cell>", "eval")
                result = eval(compiled_eval, namespace, namespace)
                if result is not None:
                    namespace["_"] = result
                    data = {}
                    if hasattr(result, "_repr_svg_") and callable(result._repr_svg_):
                        data["image/svg+xml"] = str(result._repr_svg_())
                    if hasattr(result, "_repr_html_") and callable(result._repr_html_):
                        data["text/html"] = str(result._repr_html_())
                    data["text/plain"] = repr(result)
                    outputs.append({
                        "output_type": "execute_result",
                        "data": data,
                    })
        except Exception as exc:
            tb_lines = traceback.format_exc().splitlines()
            error_obj = {
                "output_type": "error",
                "ename": type(exc).__name__,
                "evalue": str(exc),
                "traceback": tb_lines,
            }

    out_text = stdout_buf.getvalue()
    err_text = stderr_buf.getvalue()
    final_outputs = []
    if out_text:
        final_outputs.append({"output_type": "stream", "name": "stdout", "text": out_text})
    if err_text:
        final_outputs.append({"output_type": "stream", "name": "stderr", "text": err_text})
    for d in display_queue:
        final_outputs.append({"output_type": "display_data", "data": d})
    final_outputs.extend(outputs)
    if error_obj is not None:
        final_outputs.append(error_obj)
    return final_outputs

for raw_line in sys.stdin:
    line = raw_line.strip()
    if not line:
        continue
    try:
        req = json.loads(line)
        req_id = req.get("id")
        action = req.get("action")
        if action == "exec":
            outs = _execute_code(req.get("code", ""))
            resp = {"id": req_id, "ok": True, "outputs": outs}
        elif action == "vars":
            resp = {"id": req_id, "ok": True, "variables": _get_variables()}
        elif action == "reset":
            _init_namespace()
            resp = {"id": req_id, "ok": True, "outputs": []}
        else:
            resp = {"id": req_id, "ok": False, "error": f"Unknown action: {action}"}
    except Exception as e:
        resp = {"id": None, "ok": False, "error": str(e)}
    sys.stdout.write(json.dumps(resp) + "\n")
    sys.stdout.flush()
