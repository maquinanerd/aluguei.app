# Homologação — Storage (S3-compatible, baseline Cloudflare R2)

> Classificação: **IMPLEMENTED_NOT_LIVE_VERIFIED** (adapter testado com client
> mockado e SigV4 local; nenhum bucket real foi acessado).

## Estado do adapter (`packages/storage/src/s3.adapter.ts`)

| Requisito             | Estado           | Onde                                                               |
| --------------------- | ---------------- | ------------------------------------------------------------------ |
| Presigned upload      | ✅               | `getPresignedPutUrl` (PUT com `ContentType` fixado)                |
| Presigned download    | ✅ **novo**      | `getPresignedDownloadUrl` (GET) — adicionado nesta tarefa          |
| HEAD validation       | ✅               | `headObject` (NotFound/NoSuchKey → `null`)                         |
| Content-type          | ✅               | `putObject` e presign PUT setam `ContentType`                      |
| Size limit            | ✅ **novo**      | `maxSizeBytes` (opcional) em `putObject` → `StorageSizeLimitError` |
| Tenant path isolation | ⚠️ por convenção | chaves `orgs/{orgId}/…` no app; adapter é storage-agnóstico        |
| Bucket privado        | ⚠️ configuração  | acesso só via presign/credenciais (IAM/policy do bucket)           |
| Expiration            | ✅               | `expiresInSeconds` (default 300s) no PUT e GET                     |
| Delete                | ✅               | `deleteObject`                                                     |
| Metadata              | ✅               | `ContentType` no put/presign                                       |

### Limitações conhecidas (documentadas, não "inventadas")

- **Presigned PUT não limita tamanho**: assinatura SigV4 de `PutObjectCommand`
  não suporta restrição de tamanho. O `maxSizeBytes` vale para `putObject` no
  servidor; para upload direto, validar o tamanho no client (antes do upload) e
  re-validar via `headObject` após o `markUploaded`. Alternativa futura: S3
  PostPolicy (form upload) com `content-length-range` — não implementada.
- **Isolamento por tenant** é por convenção de chave (`orgs/{orgId}/…`) + bucket
  privado + credenciais de escopo mínimo; o adapter não prefixa/valida chaves
  para não acoplar a regra de negócio.
- **CORS** não é controlado pelo adapter: é configuração do bucket (ver checklist).

## Checklist de homologação

### 1. Bucket e credenciais

- [ ] Criar bucket privado (R2: sem acesso público; S3: `Block Public Access` ON).
- [ ] Credenciais de escopo mínimo (S3: policy com `PutObject/GetObject/HeadObject/
DeleteObject` apenas no bucket; R2: token com permissão no bucket).
- [ ] Credenciais **nunca** em código/commit — via env (ver `apps/api` plugin).
- [ ] Region/endpoint corretos (R2: endpoint `https://<account>.r2.cloudflarestorage.com`,
      region `auto`).

### 2. CORS do presign (upload/download direto do browser)

- [ ] `AllowedOrigins`: domínios do produto (web e painel), não `*` com credenciais.
- [ ] `AllowedMethods`: `PUT` (upload), `GET` (download), `HEAD` (validação).
- [ ] `AllowedHeaders`: `content-type` (e `x-amz-*` quando aplicável).
- [ ] `MaxAgeSeconds` definido (ex. 3600).
- [ ] Testar OPTIONS/preflight e o upload real do browser em cada ambiente.

### 3. Expiração

- [ ] Presign PUT/GET com `expiresInSeconds` compatível com o fluxo (default 300s).
- [ ] URL expirada → erro esperado (403) e fluxo de re-geração no app.

### 4. Isolamento por tenant

- [ ] Chaves sempre com prefixo `orgs/{orgId}/…` (ver rotas `properties.ts`,
      `inspections.ts`).
- [ ] Cross-tenant: teste de que org A não consegue ler/escrever chave de org B
      (o app nunca expõe chave de outra org; presign só é emitido com chave da
      própria org).
- [ ] `headObject`/`getObject` só chamados para chaves da org autenticada.

### 5. Validação

- [ ] `headObject` após upload direto para confirmar tamanho/content-type
      (`markUploaded`/`StorageObjectHead`).
- [ ] `maxSizeBytes` alinhado com o limite do plano (fotos/vistorias).

### 6. Backup/retenção

- [ ] Definir ciclo de vida (lifecycle) se houver objetos temporários (ex.
      vistorias antigas, relatórios).
- [ ] Backup/exportação do bucket documentado em `docs/OPERATIONS.md`.
- [ ] Delete: `deleteObject` chamado quando mídia/property é removida (e
      re-validar se há referências).

## Como rodar contra S3-compatível local (sem credenciais reais)

O adapter já funciona contra qualquer S3-compatible apontando `endpoint`.

### MinIO (docker)

```bash
docker run -d --name minio -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
  quay.io/minio/minio server /data --console-address ":9001"
```

- Console: http://localhost:9001 → criar bucket `aluguei-local` (privado).
- Config do adapter:
  ```ts
  new S3StorageAdapter({
    bucket: 'aluguei-local',
    endpoint: 'http://localhost:9000',
    region: 'us-east-1',
    credentials: { accessKeyId: 'minioadmin', secretAccessKey: 'minioadmin' },
    maxSizeBytes: 10 * 1024 * 1024,
  });
  ```
- Os testes de unidade usam SigV4 local (sem rede) — mesmo caminho de código
  que o MinIO, com `endpoint: http://localhost:9000`.

### Cloudflare R2 (homologação real)

- Criar bucket no painel R2, token de API com permissão apenas no bucket
  (Object Read/Write), endpoint `https://<account_id>.r2.cloudflarestorage.com`,
  region `auto`.
- Configurar CORS do bucket no painel R2 (ver checklist §2).
- Testar: presign PUT → upload browser → `headObject` → presign GET → download.

### Testes automatizados

```bash
pnpm --filter @aluguei/storage exec vitest run src/s3.adapter.test.ts
```

Cobrem: put/get/head/delete, presign PUT e GET (assinatura local), `maxSizeBytes`.

## Classificação

**IMPLEMENTED_NOT_LIVE_VERIFIED** — código e testes prontos; faltam credenciais
reais (R2 ou MinIO rodando com bucket criado) e a configuração de CORS do bucket
para validar o upload/download direto de ponta a ponta.
