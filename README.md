# Ludo dos Amigos

Jogo de Ludo online para 2 a 4 jogadores, com salas privadas, código de acesso e escolha de cores.

## Requisitos

- Node.js 18 ou superior
- npm

## Rodar localmente

1. Abra o terminal nesta pasta.
2. Instale dependências (o projeto usa apenas módulos nativos do Node.js):

   ```bash
   npm install
   ```

3. Inicie o servidor:

   ```bash
   npm start
   ```

4. Abra <http://<LocalIP>>.

Para usar outra porta no PowerShell:

```powershell
$env:PORT=<PORT>
npm start
```

## Jogar com amigos

1. Uma pessoa cria uma sala e compartilha o ID/senha com os amigos.
2. Os amigos escolhem **Entrar** na sala correspondente e informam nome e ID/senha.
3. O anfitrião inicia a partida quando houver pelo menos 2 jogadores.

O ID é exibido dentro da sala; a lista pública mostra apenas nome, participantes e status.

## Publicar no GitHub

Crie um repositório vazio no GitHub e envie os arquivos desta pasta. Não envie `node_modules` nem arquivos `.env`.

## Observações

- As salas ficam na memória do servidor e são apagadas quando ele reinicia.
- O servidor remove salas sem atividade após 2 horas.
- O login é por nome, sem senha de conta.
