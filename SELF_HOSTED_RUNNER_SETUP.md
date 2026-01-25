# Configuración de Self-Hosted Runner para GitHub Actions

Este documento describe cómo configurar un runner auto-hospedado para ejecutar los builds de VS Code en tu propia máquina.

## ¿Por qué Self-Hosted Runner?

Los runners gratuitos de GitHub Actions tienen limitaciones:
- **2 cores, 7GB RAM** (muy lento para VS Code)
- **Timeout de 6 horas** (los builds tardan más de 2h y fallan)
- **No tienen caché de builds previos** (compilación desde cero siempre)

Con un self-hosted runner en tu PC:
- Usa todos los recursos de tu máquina
- Aprovecha las compilaciones incrementales
- Sin límite de tiempo
- Builds 5-10x más rápidos

## Pasos para Configurar

### 1. Ve a Configuración del Repositorio

1. Abre https://github.com/netonjm/vscode
2. Click en **Settings** (⚙️)
3. En el menú lateral, click en **Actions** → **Runners**
4. Click en **New self-hosted runner**
5. Selecciona:
   - **Operating System:** Windows
   - **Architecture:** x64

### 2. Descarga y Configura el Runner

GitHub te mostrará comandos específicos. Ejecuta en **PowerShell como Administrador**:

```powershell
# Crear carpeta para el runner
mkdir C:\actions-runner; cd C:\actions-runner

# Descargar el runner (GitHub te dará la URL exacta)
Invoke-WebRequest -Uri https://github.com/actions/runner/releases/download/v2.XXX.X/actions-runner-win-x64-2.XXX.X.zip -OutFile actions-runner-win-x64-2.XXX.X.zip

# Extraer
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory("$PWD\actions-runner-win-x64-2.XXX.X.zip", "$PWD")
```

### 3. Configurar el Runner

```powershell
# Configurar (GitHub te dará el token único)
.\config.cmd --url https://github.com/netonjm/vscode --token TU_TOKEN_AQUI

# Cuando te pregunte:
# - Runner name: Presiona Enter (usará el nombre del PC)
# - Runner group: Presiona Enter (Default)
# - Labels: Presiona Enter (self-hosted, Windows, X64)
# - Work folder: Presiona Enter (_work)
```

### 4. Instalar como Servicio (Recomendado)

Para que el runner se ejecute automáticamente al iniciar Windows:

```powershell
# Instalar como servicio
.\svc.sh install

# Iniciar el servicio
.\svc.sh start
```

**Alternativa:** Ejecutar manualmente cada vez:
```powershell
.\run.cmd
```

### 5. Verificar que Funciona

1. Ve a https://github.com/netonjm/vscode/settings/actions/runners
2. Deberías ver tu runner con estado **Idle** (verde)
3. Si aparece **Offline**, revisa que `run.cmd` esté ejecutándose

## Uso del Runner

Una vez configurado:

1. El workflow `.github/workflows/build-release.yml` ya está configurado para usar `runs-on: self-hosted`
2. Cuando hagas push de un tag (ej: `v1.109.0-test`), el build se ejecutará en tu PC
3. Puedes ver el progreso en https://github.com/netonjm/vscode/actions

## Ventajas

- ✅ **Compilación incremental:** Solo recompila lo que cambió
- ✅ **Caché de node_modules:** No descarga dependencias cada vez
- ✅ **Caché de Electron:** No descarga Electron cada vez
- ✅ **Sin timeout:** Puede tardar lo que necesite
- ✅ **Recursos completos:** Usa toda la RAM y CPU de tu PC

## Desventajas

- ⚠️ **Tu PC debe estar encendido:** Si apagas la PC, no puede hacer builds
- ⚠️ **Usa recursos locales:** Durante el build la PC se ralentiza
- ⚠️ **Espacio en disco:** Los builds ocupan ~5GB en `C:\actions-runner\_work`

## Limpieza de Espacio

Los builds se acumulan en `C:\actions-runner\_work\vscode\vscode`:

```powershell
# Limpiar builds antiguos
cd C:\actions-runner\_work\vscode\vscode
git clean -fdx
```

## Desinstalar el Runner

Si quieres removerlo:

```powershell
cd C:\actions-runner

# Detener el servicio
.\svc.sh stop

# Desinstalar el servicio
.\svc.sh uninstall

# Desconfigurarlo de GitHub
.\config.cmd remove --token TU_TOKEN_REMOVAL
```

## Troubleshooting

### El runner aparece offline
```powershell
# Verificar si está corriendo
Get-Service | Where-Object {$_.Name -like "*actions*"}

# Reiniciar el servicio
.\svc.sh restart
```

### Error "Access Denied"
- Ejecuta PowerShell como **Administrador**
- El runner necesita permisos para escribir en `C:\actions-runner`

### Build falla con "Command not found"
- Verifica que Node.js esté en el PATH del sistema
- Cierra y vuelve a abrir PowerShell después de instalar Node.js

## Siguiente Paso

Una vez configurado el runner, puedes probar haciendo push de un tag:

```bash
git tag v1.109.0-selfhosted-test
git push origin v1.109.0-selfhosted-test
```

El build debería ejecutarse en https://github.com/netonjm/vscode/actions
