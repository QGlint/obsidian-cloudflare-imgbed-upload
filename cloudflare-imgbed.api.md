# 上传 API

上传 API 支持通过第三方上传文件至 CloudFlare ImgBed，便于集成到各种应用和服务中。


## 基本信息

- **端点**：`/upload`
- **方法**：`POST`
- **认证**：使用上传认证码或 API Token（需要`upload`权限）
- **内容类型**：`multipart/form-data`
- **文件大小限制**：根据存储渠道而定

## 请求参数

### Query 参数

| 参数名 | 类型 | 必需 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `authCode` | string | 否 | - | 上传认证码 |
| `serverCompress` | boolean | 否 | `true` | 服务端压缩（仅针对Telegram渠道的图片文件） |
| `uploadChannel` | string | 否 | `telegram` | 上传渠道：`telegram`、`cfr2`、`s3`、`discord`、`huggingface` |
| `channelName` | string | 否 | - | 指定渠道名称，用于多渠道场景下选择特定渠道上传。可通过 `/api/channels` 获取可用渠道列表 |
| `autoRetry` | boolean | 否 | `true` | 失败时自动切换渠道重试 |
| `uploadNameType` | string | 否 | `default` | 文件命名方式，可选值为`[default, index, origin, short]`，分别代表默认`前缀_原名`命名、`仅前缀`命名、`仅原名`命名和`短链接`命名法，默认为`default` |
| `returnFormat` | string | 否 | `default` | 返回链接格式，可选值为`[default, full]`，分别代表默认的`/file/id`格式、完整链接格式 |
| `uploadFolder` | string | 否 | - | 上传目录，用相对路径表示，例如上传到img/test目录需填`img/test` |


### Body 参数

| 参数名 | 类型 | 必需 | 说明 |
|--------|------|------|------|
| `file` | File | 是 | 要上传的文件 |

### 分块上传参数

使用分块上传时，需要以下额外参数：

| 参数名 | 类型 | 必需 | 说明 |
|--------|------|------|------|
| `initChunked` | boolean | 否 | 设置为 `true` 以初始化分块上传会话 |
| `chunked` | boolean | 否 | 上传分块或合并时设置为 `true` |
| `merge` | boolean | 否 | 请求合并分块时设置为 `true` |
| `uploadId` | string | 是* | 分块上传和合并请求必需（由初始化返回） |
| `chunkIndex` | integer | 是* | 上传分块时必需（从0开始的索引） |
| `totalChunks` | integer | 是* | 初始化、上传分块和合并请求必需 |
| `originalFileName`| string | 是* | 初始化、上传分块和合并请求必需 |
| `originalFileType`| string | 是* | 初始化、上传分块和合并请求必需 |

### 分块上传流程

1.  **初始化**：发送 POST 请求，携带 `initChunked=true`、`totalChunks`、`originalFileName` 和 `originalFileType`。服务器返回 `uploadId`。
2.  **上传分块**：对于每个分块，发送 POST 请求，携带 `chunked=true`、`uploadId`、`chunkIndex`、`totalChunks`、`originalFileName`、`originalFileType` 和分块 `file`。
    *   **注意**：分块上传是同步的。服务器会等待分块上传到存储提供商后才响应。
3.  **合并**：所有分块上传完成后，发送 POST 请求，携带 `chunked=true`、`merge=true`、`uploadId`、`totalChunks`、`originalFileName` 和 `originalFileType`。
    *   **注意**：合并过程是同步的。服务器会等待文件合并完成并返回最终结果。

## 响应格式

`data[0].src`为获得的图片链接（注意不包含域名，需要自己添加）

## 示例

### 请求示例

```bash
 curl --location --request POST 'https://your.domain/upload?authCode=your_authCode' \

 --header 'User-Agent: Apifox/1.0.0 (https://apifox.com)' \
 
 --form 'file=@"D:\\杂文件\\壁纸\\genshin109.jpg"'
```


### 响应示例

```json
[
  {
    "src": "/file/abc123_image.jpg"
  }
]
```


# 删除 API

删除 API 支持删除 CloudFlare ImgBed 中的文件，包括单个文件删除和批量文件夹删除功能。

## 基本信息

- **端点**：`/api/manage/delete/{path}`
- **方法**：`GET`
- **认证**：需要`delete`权限
- **内容类型**：`application/json`

## 请求参数

### 路径参数

| 参数名 | 类型 | 必需 | 说明 |
|--------|------|------|------|
| `path` | string | 是 | 文件或文件夹路径（如file.png或your/folder） |

### Query 参数

| 参数名 | 类型 | 必需 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `folder` | boolean | 否 | `false` | 是否为文件夹删除，`true`表示删除整个文件夹及其内容 |

## 功能说明

### 单文件删除
当 `folder` 参数为 `false` 或未提供时，删除指定的单个文件。

### 文件夹删除
当 `folder` 参数为 `true` 时，递归删除指定文件夹及其所有子文件夹和文件。

## 响应格式

### 单文件删除成功响应

```json
{
  "success": true,
  "fileId": "example/image.jpg"
}
```

### 文件夹删除成功响应

```json
{
  "success": true,
  "deleted": [
    "folder/image1.jpg",
    "folder/image2.png",
    "folder/subfolder/image3.gif"
  ],
  "failed": []
}
```

### 错误响应

```json
{
  "success": false,
  "error": "Delete file failed"
}
```

## 示例

### 删除单个文件

```bash
curl --location --request DELETE 'https://your.domain/api/manage/delete/example/image.jpg' \
--header 'Authorization: Bearer your_token'
```

### 删除文件夹

```bash
curl --location --request DELETE 'https://your.domain/api/manage/delete/example/folder?folder=true' \
--header 'Authorization: Bearer your_token'
```