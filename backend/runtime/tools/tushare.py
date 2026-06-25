from __future__ import annotations

import csv
import io
import json

import httpx

from config import settings
from .file_read import _resolve, _root  # 复用 ROOT 校验(防越狱)
from .registry import register_tool

TUSHARE_ENDPOINT = "https://api.tushare.pro"


class TushareTool:
    """查询 Tushare Pro 金融数据。单工具 + api_name,大表用 output_file 落 CSV。"""

    name = "tushare"
    description = (
        "查询 Tushare Pro 金融数据(A股行情/财务/估值/资金流/公告/宏观)。"
        "api_name=接口名(如 daily/fina_indicator/income/stock_basic/cn_cpi),"
        "params=接口参数(如 {ts_code:'600519.SH', start_date:'20260101', end_date:'20260625'}),"
        "fields=返回字段逗号分隔(可选),"
        "output_file=落盘路径相对工作目录(可选,大表建议指定,工具落 CSV 后返回摘要)。"
        "完整接口列表见 skill tushare-data 的 references。"
    )
    input_schema = {
        "type": "object",
        "properties": {
            "api_name": {"type": "string", "description": "Tushare 接口名,如 daily/stock_basic/fina_indicator"},
            "params": {"type": "object", "description": "接口参数"},
            "fields": {"type": "string", "description": "返回字段,逗号分隔(可选)"},
            "output_file": {"type": "string", "description": "落盘路径(相对工作目录,可选)。大表建议指定"},
        },
        "required": ["api_name"],
    }

    async def execute(self, **params) -> str:
        api_name = params.get("api_name")
        if not api_name:
            return "必须提供 api_name 参数"
        token = settings.tushare_token.strip()
        if not token:
            return "未配置 tushare_token(请在 backend/.env 设 TUSHARE_TOKEN)"

        body = {
            "api_name": api_name,
            "token": token,
            "params": params.get("params") or {},
            "fields": params.get("fields") or "",
        }
        payload = None
        last_err = None
        for _ in range(2):  # 网络错误重试 1 次
            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    resp = await client.post(TUSHARE_ENDPOINT, json=body)
                payload = resp.json()
                break
            except Exception as e:
                last_err = e
        if payload is None:
            return f"Tushare 请求失败(重试后仍报错): {type(last_err).__name__}: {last_err}"

        code = payload.get("code")
        if code != 0:
            msg = payload.get("msg") or "未知错误"
            return f"Tushare 接口 {api_name} 返回错误(code={code}): {msg}(可能积分不足/接口不存在/参数有误)"

        data = payload.get("data") or {}
        fields = data.get("fields") or []
        items = data.get("items") or []

        output_file = params.get("output_file")
        if output_file:
            try:
                path = _resolve(output_file)
            except PermissionError as e:
                return str(e)
            path.parent.mkdir(parents=True, exist_ok=True)
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(fields)
            writer.writerows(items)
            path.write_text(buf.getvalue(), encoding="utf-8")
            preview_rows = items[:3]
            preview = "\n".join(",".join(str(c) for c in row) for row in preview_rows)
            return (f"已落盘 {output_file}:{len(items)} 行,字段 {len(fields)} 个:{','.join(fields)}\n"
                    f"前 {len(preview_rows)} 行预览:\n{preview}")

        # 小结果直接返回 JSON(供 LLM 读)
        return json.dumps({"fields": fields, "items": items}, ensure_ascii=False)


def _register_default():
    register_tool(TushareTool())


_register_default()
