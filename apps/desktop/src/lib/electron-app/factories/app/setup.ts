import { app, BrowserWindow, shell } from "electron";
import { env } from "main/env.main";
import { loadReactDevToolsExtension } from "main/lib/extensions";
import { PLATFORM } from "shared/constants";
import { makeAppId } from "shared/utils";
import { ignoreConsoleWarnings } from "../../utils/ignore-console-warnings";

ignoreConsoleWarnings(["Manifest version 2 is deprecated"]);

export async function makeAppSetup(
	createWindow: () => Promise<BrowserWindow>,
	restoreWindows?: () => Promise<void>,
) {
	await loadReactDevToolsExtension();

	// Restore windows from previous session if available
	if (restoreWindows) {
		await restoreWindows();
	}

	// If no windows were restored, create a new one
	const existingWindows = BrowserWindow.getAllWindows();
	let window: BrowserWindow;
	if (existingWindows.length > 0) {
		window = existingWindows[0];
	} else {
		window = await createWindow();
	}

	app.on("activate", async () => {
		const windows = BrowserWindow.getAllWindows();

		if (!windows.length) {
			window = await createWindow();
		} else {
			for (window of windows.reverse()) {
				window.restore();
			}
		}
	});

	app.on("web-contents-created", (_, contents) => {
		if (contents.getType() === "webview") return;
		contents.on("will-navigate", (event, url) => {
			// Always prevent in-app navigation for external URLs
			if (url.startsWith("http://") || url.startsWith("https://")) {
				event.preventDefault();
				shell.openExternal(url);
			}
		});
	});

	app.on("window-all-closed", () => !PLATFORM.IS_MAC && app.quit());
	app.on("before-quit", () => {});

	return window;
}

// Linux/Wayland: enable native Wayland rendering via Ozone when a Wayland
// compositor is detected (e.g. HyprLand, Sway, GNOME on Wayland).
// The "auto" value lets Chromium pick between Wayland and X11 at runtime.
if (PLATFORM.IS_LINUX) {
	app.commandLine.appendSwitch("ozone-platform-hint", "auto");
	// Only disable GPU acceleration on X11 — Wayland compositors rely on it.
	if (!process.env.WAYLAND_DISPLAY) {
		app.disableHardwareAcceleration();
	}
}

// macOS Sequoia+: occluded window throttling can corrupt GPU compositor layers
if (PLATFORM.IS_MAC) {
	app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
}

PLATFORM.IS_WINDOWS &&
	app.setAppUserModelId(
		env.NODE_ENV === "development" ? process.execPath : makeAppId(),
	);

app.commandLine.appendSwitch("force-color-profile", "srgb");

// Only expose CDP in development when a port is explicitly configured.
const cdpPort =
	env.NODE_ENV === "development"
		? process.env.DESKTOP_AUTOMATION_PORT
		: undefined;
if (cdpPort) {
	app.commandLine.appendSwitch("remote-debugging-port", cdpPort);
	app.commandLine.appendSwitch("remote-allow-origins", "*");
}
