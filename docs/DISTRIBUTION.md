# Distribuição desktop

No [Struct Launcher](https://openstruct.com.br/launcher), escolha **Verificar atualizações** e instale o KStruct pela biblioteca. O catálogo assinado distribui NSIS para Windows e AppImage para Linux, ambos x86_64. Os mesmos arquivos e seus hashes SHA-256 estão na [release assinada](https://github.com/ricardocorsini/openstruct-catalog/releases/tag/kstruct-v0.3.0).

O workflow [KStruct desktop packages](https://github.com/ricardocorsini/k-struct/actions/workflows/desktop-packages.yml) também gera pacotes de verificação a partir da `master`, incluindo o .deb. Os artefatos de revisão têm a retenção indicada no workflow.

| Plataforma x86-64     | Pacote                | Instalação                                                                                                                                              |
| --------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows               | `KStruct_…-setup.exe` | Execute o instalador NSIS para o usuário atual. Ele inclui o instalador offline do WebView2.                                                            |
| Linux (Debian/Ubuntu) | `.deb`                | Instale com `sudo apt install ./KStruct_…_amd64.deb`. Em instalação offline, as bibliotecas de sistema exigidas pelo pacote precisam estar disponíveis. |
| Linux                 | `.AppImage`           | Dê permissão de execução com `chmod +x KStruct_….AppImage` e abra o arquivo. Em sistemas sem FUSE, use a opção `--appimage-extract-and-run`.            |

Os artefatos de verificação incluem `SHA256SUMS.txt`, o manifesto do OOFEM e os relatórios dos autotestes. O Launcher verifica a assinatura Ed25519 do catálogo e os hashes dos pacotes. O instalador do Windows é gerado sem assinatura Authenticode.

## Publicar uma versão

Sincronize a versão dos manifestos e dos lockfiles e prepare as notas em `.github/release-notes/<tag>.md`. A alteração de `.github/source-release.json` em `master` cria a tag de origem na revisão correspondente. A publicação no hub usa a tag e o SHA exato em uma solicitação no repositório do Struct Launcher. Os dois sistemas passam pelo autoteste de instalação offline antes de liberar os pacotes.

## Conferir a instalação

1. Abra o KStruct e clique em **Configurar OOFEM → Testar motor**. O diagnóstico informa a origem e a versão do executável, e resolve a viga de referência de 6 m.
2. Em **Modelo**, abra **Viga de referência** e clique em **Analisar**. Espere duas reações de 30 kN, momento positivo de 45 kN·m e flecha central de −8,4375 mm.
3. Em **Análise → Histórico**, consulte e exporte as mensagens da execução. O histórico guarda as últimas 30 execuções locais. O estado **Motor concluído** registra o término do processo. O KStruct ainda verifica o resultado antes de mostrá-lo no modelo.

O autoteste também pode ser executado sem abrir a janela, com `k-struct --check-oofem relatorio.json` no Linux. No PowerShell, na pasta de instalação, use `Start-Process .\k-struct.exe -ArgumentList '--check-oofem relatorio.json' -Wait -PassThru`. O código de saída é zero quando o motor reproduz a referência.

## Compilar

Use Node.js, Git, Rust, CMake e os [pré-requisitos do Tauri 2](https://v2.tauri.app/start/prerequisites/). No Linux, instale Ninja. No Windows, use Visual Studio Build Tools com C++ e Windows SDK. O script usa o gerador do Visual Studio 2022 por padrão. Para Visual Studio 2026, defina a variável `KSTRUCT_OOFEM_WINDOWS_GENERATOR` como `Visual Studio 18 2026` e use CMake 4.2 ou superior. A CI usa Ubuntu 22.04, Windows Server 2025 com Visual Studio 2026 e Rust 1.100.0.

```sh
npm ci
npm run desktop:build
```

O comando baixa a tag do OOFEM, verifica o commit fixado e compila o executável antes de empacotar o KStruct. A pasta gerada `src-tauri/resources/oofem/` é incorporada ao pacote. Ela contém o manifesto de versão, o executável, as fontes exatas, a licença, o README do projeto OOFEM e a receita de compilação a partir do arquivo de fontes. O empacotamento verifica os hashes dos arquivos instalados. A instalação e execução podem usar esses recursos locais depois que os arquivos forem baixados.

O pacote .deb usa o WebKitGTK do sistema. No Windows, o NSIS inclui o instalador offline do WebView2. O OOFEM é um processo separado e pode ser trocado pelo caminho escolhido em **Configurar OOFEM**.
