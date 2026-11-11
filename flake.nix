{
  description = "Portable IPMA container, Terraform and Google Cloud tooling";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    make-shell.url = "github:nicknovitski/make-shell";
    gcloud-nix.url = "github:nicknovitski/gcloud-nix";
  };

  outputs =
    {
      nixpkgs,
      make-shell,
      gcloud-nix,
      ...
    }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];
      forEachSystem = nixpkgs.lib.genAttrs systems;
      packagesFor =
        system:
        import nixpkgs {
          inherit system;
          overlays = [ make-shell.overlays.default ];
          # Terraform is BUSL licensed; allow only this package, not all unfree software.
          config.allowUnfreePredicate = pkg: nixpkgs.lib.getName pkg == "terraform";
        };
    in
    {
      devShells = forEachSystem (
        system:
        let
          pkgs = packagesFor system;
        in
        {
          default = pkgs.make-shell {
            imports = [ gcloud-nix.shellModules.default ];
            gcloud.enable = true;
            gcloud.properties.run.region = "europe-southwest1";
            packages = with pkgs; [
              nodejs_24
              terraform
              git
              gh
              jq
              curl
              just
              docker-client
              actionlint
              shellcheck
              hadolint
              nixfmt
              deadnix
              statix
              direnv
              rtk
            ];
          };
        }
      );

      formatter = forEachSystem (system: (packagesFor system).nixfmt);

      checks = forEachSystem (
        system:
        let
          pkgs = packagesFor system;
        in
        {
          nix-source =
            pkgs.runCommand "ipma-nix-source-check"
              {
                nativeBuildInputs = [
                  pkgs.nixfmt
                  pkgs.deadnix
                  pkgs.statix
                ];
              }
              ''
                cp ${./flake.nix} flake.nix
                nixfmt --check flake.nix
                deadnix --fail flake.nix
                statix check .
                touch "$out"
              '';
        }
      );
    };
}
