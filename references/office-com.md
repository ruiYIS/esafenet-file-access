# Office 文件在亿赛通下的读取与写入（Excel / Word COM）

`win32com` 驱动 Excel / Word 是**受信进程**，能透明解密读、透明加密写，是处理加密办公文件的唯一可靠通道。`openpyxl` / `python-docx` 是非受信进程，读加密文件会报 `file is not a zip file`。

## 判断 xlsx 是否加密/损坏

xlsx 是 zip。写一个预检（不依赖任何库也能做）：

```python
import zipfile
def is_valid_xlsx(path):
    try:
        with zipfile.ZipFile(path) as z:
            return z.testzip() is None
    except Exception:
        return False
```

- 返回 `True` → 合法明文，可 `openpyxl` 直读写。
- 返回 `False` + 文件确实存在 → 大概率加密或损坏，转 **Excel COM**。

## 用 Python 写一个 COM 脚本（存成 `.py`，用 `py script.py` 跑）

> 注意：脚本文件本身用 IDE `Write` 工具写出（受信），再用 `py`（受信）执行。不要在脚本里改写你自己的源码。

### 读 Excel（透明解密）

```python
import win32com.client as win32
import os
path = os.path.abspath(r"D:\data\目标.xlsx")
xl = win32.DispatchEx("Excel.Application")
xl.Visible = False
xl.DisplayAlerts = False
try:
    wb = xl.Workbooks.Open(path, ReadOnly=True)
    ws = wb.Worksheets(1)
    used = ws.UsedRange
    rows = used.Value  # 二维 tuple 或单值
    print(rows)
    wb.Close(False)
finally:
    xl.Quit()
```

### 写 Excel（透明加密，保持正常查看）

逐单元格写比整片赋值更稳；日期用 Excel 序列值避免时区偏移（pywin32 COM 会按 UTC 转换导致中国时区 +8 小时偏移）。

```python
import win32com.client as win32
import os
from datetime import datetime
path = os.path.abspath(r"D:\data\目标.xlsx")
xl = win32.DispatchEx("Excel.Application")
xl.Visible = False
xl.DisplayAlerts = False
try:
    wb = xl.Workbooks.Open(path)   # 加密文件由 COM 透明打开
    ws = wb.Worksheets(1)
    # 追加一行：A 到 H
    new_row = [序号, 图号, 设计师, 建议类型, 详细说明, 提出人, 日期, 图纸名称]
    nxt = ws.UsedRange.Rows.Count + 1
    # 若首行无表头需先补表头
    for col, val in enumerate(new_row, start=1):
        if isinstance(val, datetime):
            ws.Cells(nxt, col).Value = val.strftime("%Y-%m-%d %H:%M:%S")
        else:
            ws.Cells(nxt, col).Value = val if val is not None else ""
    wb.Save()
    wb.Close(False)
finally:
    xl.Quit()
```

### 三级回退策略（Excel 写入主流程）

```python
def write_excel(target_path, build_book_fn):
    """
    build_book_fn(wb) 负责往 openpyxl 工作簿里写内容，返回 None。
    1.目标合法明文 -> openpyxl 直写
    2.疑似加密   -> Excel COM 代写
    3.两者都失败 -> 改名留档备份 + 新建
    """
    import os, shutil, time
    from datetime import datetime
    # 1. 探测
    if os.path.exists(target_path) and is_valid_xlsx(target_path):
        try:
            import openpyxl
            wb = openpyxl.load_workbook(target_path)
            build_book_fn(wb)
            wb.save(target_path)
            merge_encrypted_backups(target_path)
            return target_path
        except Exception:
            pass  # 落到 COM
    # 2. COM 代写
    try:
        write_via_com(target_path, build_book_fn)
        merge_encrypted_backups(target_path)
        return target_path
    except Exception as e:
        # 3. 兜底：改名留档 + 新建
        backup = f"{os.path.splitext(target_path)[0]}.加密备份_{datetime.now():%Y%m%d%H%M%S}.xlsx"
        if os.path.exists(target_path):
            shutil.move(target_path, backup)
        import openpyxl
        wb = openpyxl.Workbook()
        build_book_fn(wb)
        wb.save(target_path)
        merge_encrypted_backups(target_path)
        return target_path
```

### 合并加密备份（自愈）

每次写入成功后，用 COM 把散落的 `*.加密备份_*.xlsx` 合并进主文件、重排行号、删备份；打不开的备份保留、不影响本次写入，失败分类为「文件被占用 / 非法格式 / 其他」，锁文件场景等关闭后再自动补合并。

```python
import glob, os
def merge_encrypted_backups(main_path):
    base = os.path.splitext(main_path)[0]
    backups = sorted(glob.glob(base + ".加密备份_*.xlsx"))
    if not backups:
        return
    xl = win32.DispatchEx("Excel.Application")
    xl.Visible = False; xl.DisplayAlerts = False
    try:
        for b in backups:
            try:
                src = xl.Workbooks.Open(os.path.abspath(b), ReadOnly=True)
                dst = xl.Workbooks.Open(os.path.abspath(main_path))
                # 把 src 的 UsedRange 追加到 dst 末尾，再重排行号（示例，按实际列调整）
                copy_rows_into(src.Worksheets(1), dst.Worksheets(1))
                src.Close(False); dst.Save(); dst.Close(False)
                os.remove(b)
            except Exception:
                continue  # 保留无法打开的备份
    finally:
        xl.Quit()
```

## Word（docx）COM

```python
import win32com.client as win32, os
path = os.path.abspath(r"D:\doc\某文档.docx")
word = win32.DispatchEx("Word.Application")
word.Visible = False
word.DisplayAlerts = False
try:
    doc = word.Documents.Open(path)      # 加密 docx 透明打开
    # 读全文
    text = doc.Content.Text
    # 追加段落
    doc.Content.InsertAfter("\n新增内容")
    doc.Save()                            # 保持加密状态落盘
    doc.Close(False)
finally:
    word.Quit()
```

## 通用注意事项

- 打开带锁文件会失败：目标正被 Excel/Word 打开时，先提示用户关闭或等 0.8s 重试一次。
- 路径用 `os.path.abspath`，**不要放 Temp 目录**（亿赛通对 Temp 有特殊管控，Office 打不开）。
- 打包 PyInstaller 单文件时，`__file__` 指向临时解包目录：基目录要解析到 exe 实际位置，别硬编码路径常量。
- Excel COM 依赖 `win32timezone`：PyInstaller 要显式 `--hidden-import pywintypes --hidden-import pythoncom --hidden-import win32timezone`，否则运行时缺模块。
