{
  pkgs ? import <nixpkgs> { },
}:

let
  rustToolchain = with pkgs; [
    # rustc
    # cargo
  ];

  tauriRuntimeDeps = with pkgs; [
    gtk3
    gdk-pixbuf
    cairo
    pango
    libsoup_3
    webkitgtk_4_1
    gvfs
    glib
    mesa
    libglvnd
    gst_all_1.gstreamer
    gst_all_1.gst-plugins-base
    gst_all_1.gst-plugins-good
  ];

  # Solidity / Ethereum toolchain
  soundTools = with pkgs; [
    alsa-lib
    udev
  ];

in
pkgs.mkShell {
  packages =
    rustToolchain
    ++ [
      pkgs.git
      pkgs.nodejs
      pkgs.bun
      pkgs.tailwindcss
      pkgs.pkg-config
      pkgs.xdg-utils
      pkgs.makeWrapper
    ]
    ++ tauriRuntimeDeps
    ++ soundTools;

  shellHook = ''
    # Set LD_LIBRARY_PATH for runtime libraries (GLib, WebKit, Mesa)
    export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath tauriRuntimeDeps}:$LD_LIBRARY_PATH"

    # Set PKG_CONFIG_PATH for build tools to find required libraries
    export PKG_CONFIG_PATH="${
      pkgs.lib.makeSearchPathOutput "dev" "lib/pkgconfig" tauriRuntimeDeps
    }:$PKG_CONFIG_PATH"

    # Ensure XDG utilities are in PATH
    export PATH="$PATH:${pkgs.xdg-utils}/bin"

    # WebKit setting to potentially avoid rendering issues
    export WEBKIT_DISABLE_COMPOSITING_MODE=1

    echo "--- Entering Pure Tauri Development Shell (Stable Nixpkgs) ---"
  '';
}
