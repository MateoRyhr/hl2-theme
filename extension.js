const vscode = require('vscode');
const path = require('path');
const { exec, execSync } = require('child_process');

const sounds = {
    startup: { file: 'hev_logon.mp3', volume: 0.8, priority: 2 },
    saveFile: { file: 'medic_shot.mp3', volume: 0.1, priority: 1 },
    fileCreated: { file: 'battery_pickup.mp3', volume: 0.125, priority: 2 },
    fileDeleted: { file: 'energy_disintegrate4.mp3', volume: 0.1, priority: 2 },
    terminal: { file: 'combine_radio.mp3', volume: 0.7, priority: 1 },
    terminalError: { file: 'major_fracture_detected.mp3', volume: 0.75, priority: 2 },
    tabSwitch: { file: 'button_roll_over.mp3', volume: 0.8, priority: 0 },
    fileOpen: { file: 'physcannon_pickup.mp3', volume: 0.05, priority: 1 },
    fileClosed: { file: 'physcannon_drop.mp3', volume: 0.05, priority: 1 }
};

/**
 * Check if the extension dependencies are installed
 */
function checkDependencies() {
    if (process.platform === 'linux') {
        try {
            // Check if mpg123 is installed
            execSync('command -v mpg123'); 
            return true;
        } catch (e) {
            // If it fails, show a friendly notification with a link
            vscode.window.showErrorMessage(
                "HEV System: 'mpg123' is required for sounds on Linux.",
                "How to install?"
            ).then(selection => {
                if (selection === "How to install?") {
                    vscode.env.openExternal(vscode.Uri.parse("https://github.com/MateoRyhr/hl2-theme#installation"));
                }
            });
            return false;
        }
    }
    return true; // Windows/Mac usually handle it differently
}

/**
 * Checks if a specific sound type is enabled in the user's settings.
 * @param {string} soundKey 
 * @returns {boolean}
 */
function isSoundEnabled(soundConfigName) {
    const config = vscode.workspace.getConfiguration('half-life-theme');
    const masterSwitch = config.get('enableSounds');
    
    if (!masterSwitch) return false;
    return config.get(soundConfigName, true);
}

// Variables globales para el control de colisiones y prioridades
let lastSoundTime = 0;
let lastPriority = -1;
let pendingSoundTimeout = null;

const GLOBAL_SOUND_COOLDOWN = 150; 
const EVENT_DELAY = 50; // 50ms buffer to catch overriding events

/**
 * Sound player handler with Volume, Collision, and Priority Control
 * @param {Object} soundObj - The object containing {file, volume, priority}
 * @param {string} extensionPath 
 * @param {string} soundKey - The config key to check if enabled
 */
function playHevSound(soundObj, extensionPath, soundKey) {
    if (!isSoundEnabled(soundKey)) return;

    const currentPriority = soundObj.priority || 0;
    const now = Date.now();

    // 1. Interruption Logic
    if (pendingSoundTimeout) {
        if (currentPriority > lastPriority) {
            // New sound is more important, cancel the pending one
            clearTimeout(pendingSoundTimeout);
            pendingSoundTimeout = null;
        } else {
            // New sound is equal or less important than the pending one, ignore it
            return;
        }
    } else if (now - lastSoundTime < GLOBAL_SOUND_COOLDOWN) {
        // We are in a cooldown period from a recently played sound
        if (currentPriority <= lastPriority) {
            // Only interrupt if the new sound is strictly more important
            return;
        }
    }

    // 2. Queue the new sound
    lastPriority = currentPriority;
    
    pendingSoundTimeout = setTimeout(() => {
        // Execution
        lastSoundTime = Date.now();
        pendingSoundTimeout = null;
        
        const fileName = soundObj.file;
        const volume = soundObj.volume || 1.0;
        const filePath = path.join(extensionPath, 'audio', fileName);
        
        let command = '';
        const linuxVol = Math.floor(32768 * volume);
        const macVol = volume;
        const winVol = Math.floor(volume * 100);

        switch (process.platform) {
            case 'linux':
                command = `mpg123 -q -f ${linuxVol} "${filePath}"`;
                break;
            case 'darwin': 
                command = `afplay -v ${macVol} "${filePath}"`;
                break;
            case 'win32':
                command = `powershell -c "$wmp = New-Object -ComObject WMPlayer.OCX; $wmp.settings.volume = ${winVol}; $wmp.URL = '${filePath}'; while($wmp.playState -ne 1) { Start-Sleep -Milliseconds 100 }"`;
                break;
        }

        if (command) {
            exec(command, (error) => {
                if (error && !error.message.includes('playState')) {
                    console.error(`HEV System Error: Execution failed on ${process.platform}`, error);
                }
            });
        }
    }, EVENT_DELAY);
}

/**
 * Subscribe the sounds responses to events
 * @param {vscode.ExtensionContext} context
 */
function subscribeSoundsToEvents(context){
    // Play sound on saving file
    const fileSaveSub = vscode.workspace.onDidSaveTextDocument((document) => {
        playHevSound(sounds.saveFile, context.extensionPath, 'enableFileSaveSound');
    });

    // Play sound on create file
    const fileCreateSub = vscode.workspace.onDidCreateFiles((event => {
        playHevSound(sounds.fileCreated, context.extensionPath, 'enableFileCreatedSound')
    }));

    // Play sound on open file
    const fileOpenSub = vscode.workspace.onDidOpenTextDocument((event) => {
        playHevSound(sounds.fileOpen, context.extensionPath, 'enableFileOpenSound')
    })

    // Play sound on closed file
    const fileClosedSub = vscode.workspace.onDidCloseTextDocument((event) => {
        playHevSound(sounds.fileClosed, context.extensionPath, 'enableFileClosedSound')
    })

    // Play sound on delete file
    const fileDeleteSub = vscode.workspace.onDidDeleteFiles((event => {
        playHevSound(sounds.fileDeleted, context.extensionPath, 'enableFileDeletedSound')
    }))

    // Play sound on authorize folder, epico
    // vscode.workspace.onDidGrantWorkspaceTrust

    // Play sound on change tab
    const tabChangeSub = vscode.window.onDidChangeActiveTextEditor((editor) => {
        playHevSound(sounds.tabSwitch, context.extensionPath, 'enableTabSwitchSound');
    });

    context.subscriptions.push(
        fileOpenSub,
        fileClosedSub,
        fileDeleteSub,
        fileSaveSub,
        fileCreateSub,
        tabChangeSub
    );
}

/**
 * Ensures our custom command bypasses the integrated terminal shell
 */
async function registerCommandToSkipShell(myCommandId) {
    const config = vscode.workspace.getConfiguration('terminal.integrated');
    
    // Retrieve the current array of commands that skip the shell
    // Defaulting to an empty array if it doesn't exist
    let skipCommands = config.get('commandsToSkipShell', []);

    // If our command is not in the list, we add it and update the global settings
    if (Array.isArray(skipCommands) && !skipCommands.includes(myCommandId)) {
        // Create a new array to ensure VS Code detects the change
        const updatedCommands = [...skipCommands, myCommandId];
        await config.update('commandsToSkipShell', updatedCommands, vscode.ConfigurationTarget.Global);
        console.log(`HEV System: Added ${myCommandId} to commandsToSkipShell.`);
    }
}

/**
 * Register the extension commands
 * @param {vscode.ExtensionContext} context
 */
function registerCommands(context){
    registerCommandToSkipShell('hl2Theme.togglePanelWithSound');

    const togglePanelCmd = vscode.commands.registerCommand('hl2Theme.togglePanelWithSound', async () => {
        playHevSound(sounds.terminal, context.extensionPath, 'half-life-theme.enableTerminalOpenSound');
        await vscode.commands.executeCommand('workbench.action.terminal.toggleTerminal');
    });
    
    const enableSoundsCmd = vscode.commands.registerCommand('hl2Theme.enableAllSounds', () => {
        toggleGlobalSounds(true);
    });

    const disableSoundsCmd = vscode.commands.registerCommand('hl2Theme.disableAllSounds', () => {
        toggleGlobalSounds(false);
    });

    context.subscriptions.push(
        togglePanelCmd,
        enableSoundsCmd,
        disableSoundsCmd
    );
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    // Check if this is the first time the extension runs
    const hasShownWalkthrough = context.globalState.get('hasShownWalkthrough', false);
    
    registerCommands(context)

    if (!hasShownWalkthrough) {
        // Open the walkthrough automatically
        vscode.commands.executeCommand('workbench.action.openWalkthrough', {
            category: 'MateoRyhr.hl2-theme#hl2-walkthrough', // Format: publisher.name#walkthroughID
            step: 'activate-theme'
        }, false);
        
        // Save state so it doesn't open every single time
        context.globalState.update('hasShownWalkthrough', true);
    }
    
    checkDependencies()
    console.log('HEV Mark IV Protective System Active on ' + process.platform);

    // 1. Welcome sound
    playHevSound(sounds.startup, context.extensionPath, 'enableStartupSound');

    // --- EVENT LISTENERS ---
    subscribeSoundsToEvents(context)
}

/**
 * Updates the global sound configuration
 * @param {boolean} newState 
 */
async function toggleGlobalSounds(newState) {
    const config = vscode.workspace.getConfiguration('hl2Theme');
    // We update globally (ConfigurationTarget.Global) so it persists
    await config.update('enableSounds', newState, vscode.ConfigurationTarget.Global);
    
    const status = newState ? "ACTIVATED" : "DEACTIVATED";
    vscode.window.showInformationMessage(`HEV System sounds ${status}.`);
}

function deactivate() {}

module.exports = { activate, deactivate };