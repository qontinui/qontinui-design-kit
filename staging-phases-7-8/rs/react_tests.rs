    /// The runner's own `package.json`: the floor for the template's
    /// `@qontinui/ui-bridge` pin, so a fresh scaffold never starts on an older
    /// UI Bridge contract than the runner that created it.
    const RUNNER_PACKAGE_JSON: &str = include_str!("../../../package.json");

    /// Every path the design-bearing template must write.
    const REACT_PATHS: [&str; 21] = [
        "package.json",
        "vite.config.ts",
        "tsconfig.json",
        "index.html",
        "specimen.html",
        "src/main.tsx",
        "src/App.tsx",
        "src/index.css",
        "design/language.dtcg.json",
        "src/design/tokens.css",
        "src/design/tokens.ts",
        "src/design/theme.css",
        "src/design/compile-report.json",
        "src/design/design-budgets.json",
        "src/design/visual-system.thresholds.json",
        "src/design/app.styleguide.uibridge.json",
        "specs/.gitkeep",
        "README.md",
        ".gitignore",
        "CLAUDE.md",
        ".github/workflows/ci.yml",
    ];

    const INDEX_START: &str = "<!-- design-kit-index:start -->";
    const INDEX_END: &str = "<!-- design-kit-index:end -->";

    /// `^1.2.3` / `~1.2.3` / `1.2.3` -> (1, 2, 3). `None` for anything else
    /// (a git ref, a tag, a range with an upper bound).
    fn version_floor(range: &str) -> Option<(u64, u64, u64)> {
        let v = range.trim_start_matches(['^', '~', '=', ' ']);
        let mut parts = v.split('.').map(|p| p.parse::<u64>().ok());
        let floor = (parts.next()??, parts.next()??, parts.next()??);
        parts.next().is_none().then_some(floor)
    }

    /// `github:<owner>/<repo>#v<major>.<minor>.<patch>` — a git dependency
    /// pinned to a release tag (never a branch, a sha, or a registry range).
    fn is_git_tag_ref(spec: &str) -> bool {
        let Some(rest) = spec.strip_prefix("github:") else {
            return false;
        };
        let Some((_repo, tag)) = rest.split_once('#') else {
            return false;
        };
        tag.strip_prefix('v').and_then(version_floor).is_some() && !tag.contains(['^', '~'])
    }

    /// Every leaf (an object carrying `$extensions.qontinui.source`) under
    /// `value`, as (dotted path, source).
    fn source_leaves(value: &serde_json::Value, path: &str, out: &mut Vec<(String, String)>) {
        let Some(obj) = value.as_object() else {
            return;
        };
        if let Some(src) = obj
            .get("$extensions")
            .and_then(|e| e.get("qontinui"))
            .and_then(|q| q.get("source"))
            .and_then(|s| s.as_str())
        {
            out.push((path.to_string(), src.to_string()));
        }
        for (k, v) in obj {
            if !k.starts_with('$') {
                let child = if path.is_empty() {
                    k.clone()
                } else {
                    format!("{path}.{k}")
                };
                source_leaves(v, &child, out);
            }
        }
    }

    /// Everything the design-bearing template must satisfy, as named
    /// violations. Empty means conforming. The seeded-violation test below
    /// reddens each check, so none of them is vacuous.
    fn design_violations(files: &[TemplateFile], runner_package_json: &str) -> Vec<String> {
        let mut bad = Vec::new();
        let get = |p: &str| files.iter().find(|f| f.path == p).map(|f| f.content.as_str());
        for p in REACT_PATHS {
            if get(p).is_none() {
                bad.push(format!("missing path {p}"));
            }
        }
        for f in files {
            if f.content.contains("{{name}}") || f.content.contains("{{app_id}}") {
                bad.push(format!("placeholder left in {}", f.path));
            }
        }

        let pkg: serde_json::Value = get("package.json")
            .and_then(|c| serde_json::from_str(c).ok())
            .unwrap_or(serde_json::Value::Null);
        let build = pkg["scripts"]["build"].as_str().unwrap_or("");
        for step in [
            "design-kit compile --check",
            "design-kit index --check",
            "design-kit lint-classes src",
            "tsc --noEmit",
            "vite build",
        ] {
            if !build.contains(step) {
                bad.push(format!("build script lacks `{step}`"));
            }
        }
        let kit = pkg["dependencies"]["@qontinui/design-kit"].as_str().unwrap_or("");
        if !is_git_tag_ref(kit) {
            bad.push(format!("design-kit dependency `{kit}` is not a git ref in tag form"));
        }
        let runner: serde_json::Value =
            serde_json::from_str(runner_package_json).unwrap_or(serde_json::Value::Null);
        let floor = runner["dependencies"]["@qontinui/ui-bridge"]
            .as_str()
            .and_then(version_floor);
        let pin = pkg["dependencies"]["@qontinui/ui-bridge"]
            .as_str()
            .and_then(version_floor);
        match (pin, floor) {
            (Some(p), Some(f)) if p >= f => {}
            (p, f) => bad.push(format!("ui-bridge pin {p:?} is below the runner's {f:?}")),
        }
        for dep in ["tailwindcss", "@tailwindcss/vite"] {
            let spec = pkg["devDependencies"][dep].as_str().unwrap_or("");
            if version_floor(spec).map(|v| v.0) != Some(4) {
                bad.push(format!("{dep} `{spec}` is not Tailwind v4"));
            }
        }

        let source: serde_json::Value = get("design/language.dtcg.json")
            .and_then(|c| serde_json::from_str(c).ok())
            .unwrap_or(serde_json::Value::Null);
        let mut leaves = Vec::new();
        source_leaves(&source, "", &mut leaves);
        if leaves.is_empty() {
            bad.push("language source declares no leaves".to_string());
        }
        for (path, src) in &leaves {
            let identity = path.starts_with("color")
                || path.starts_with("type.family")
                || path.starts_with("imagery");
            if identity && src.starts_with("authored") {
                bad.push(format!("identity leaf {path} is agent-authored"));
            }
            if let Some(inner) = src.strip_prefix("authored(") {
                if inner.trim_end_matches(')').is_empty() {
                    bad.push(format!("authored leaf {path} carries no notification_ref"));
                }
            } else if src == "authored" {
                bad.push(format!("authored leaf {path} carries no notification_ref"));
            }
        }

        let claude = get("CLAUDE.md").unwrap_or("");
        match (claude.find(INDEX_START), claude.find(INDEX_END)) {
            (Some(s), Some(e)) if s < e => {}
            _ => bad.push("CLAUDE.md lacks the index markers in order".to_string()),
        }

        let ci = get(".github/workflows/ci.yml").unwrap_or("");
        for (needle, why) in [
            ("- run: npm install", "must run npm install"),
            ("- run: npm run build", "must run npm run build"),
        ] {
            if !ci.contains(needle) {
                bad.push(format!("ci.yml {why}"));
            }
        }
        for (needle, why) in [
            ("npm ci", "npm ci fails on a scaffold with no lockfile"),
            ("cache:", "a lockfile-keyed cache fails with no lockfile"),
            ("git diff", "a tree-cleanliness step fails by construction"),
            ("${{", "Actions expressions stay out of a templated file"),
        ] {
            if ci.contains(needle) {
                bad.push(format!("ci.yml contains `{needle}`: {why}"));
            }
        }
        bad
    }

    fn react_files() -> Vec<TemplateFile> {
        template_files(TEMPLATE_REACT_UI_BRIDGE, "My-App", "my-app").unwrap()
    }

    #[test]
    fn react_template_is_fully_parameterized() {
        let files = react_files();
        let paths: Vec<&str> = files.iter().map(|f| f.path).collect();
        for expected in REACT_PATHS {
            assert!(paths.contains(&expected), "missing {}", expected);
        }
        assert_eq!(paths.len(), REACT_PATHS.len(), "unexpected extra paths");
        let violations = design_violations(&files, RUNNER_PACKAGE_JSON);
        assert!(violations.is_empty(), "{violations:#?}");

        let pkg = files.iter().find(|f| f.path == "package.json").unwrap();
        assert!(pkg.content.contains("\"name\": \"my-app\""));
        assert!(pkg.content.contains("@qontinui/ui-bridge"));
        assert!(pkg.content.contains("@qontinui/ui-bridge-auto"));
        let vite = files.iter().find(|f| f.path == "vite.config.ts").unwrap();
        assert!(vite
            .content
            .contains("import { uiBridgeIRPlugin } from \"@qontinui/ui-bridge-auto/ir-builder\""));
        assert!(vite.content.contains("documentId: \"my-app\""));
        assert!(vite.content.contains("specimen.html"));
        let app = files.iter().find(|f| f.path == "src/App.tsx").unwrap();
        assert!(app.content.contains("<State"));
        assert!(app.content.contains("id=\"home\""));
        // Every state of the page is handled: the four required props.
        for prop in ["empty=", "loading=", "error=", "filteredEmpty="] {
            assert!(app.content.contains(prop), "App.tsx lacks {prop}");
        }
        // The compiled theme is exclusive: it clears every default first.
        let theme = files
            .iter()
            .find(|f| f.path == "src/design/theme.css")
            .unwrap();
        assert!(theme.content.contains("--*: initial;"));
        // The undeclared identity says so on the specimen's every frame.
        let specimen = files.iter().find(|f| f.path == "specimen.html").unwrap();
        assert!(specimen
            .content
            .contains("data-design-identity=\"undeclared\""));
        // The CI workflow is what makes a scaffolded repo's PRs blockable at
        // all; its measured constraints are pinned here so a later "cleanup"
        // cannot quietly break a bare scaffold's build.
        let ci = files
            .iter()
            .find(|f| f.path == ".github/workflows/ci.yml")
            .unwrap();
        assert!(ci.content.contains("- run: npm install"));
        assert!(ci.content.contains("- run: npm run build"));
        // No lockfile ships, so `npm ci` and setup-node's lockfile-keyed cache
        // both fail on a bare scaffold.
        assert!(!ci.content.contains("npm ci"));
        assert!(!ci.content.contains("cache:"));
        // `vite build` writes src/state-machine.derived.json, so a
        // tree-cleanliness step would fail by construction.
        assert!(!ci.content.contains("git diff"));
        // Keep Actions' expression syntax out of a file this module templates.
        assert!(!ci.content.contains("${{"));
    }

    /// Each seeded fixture breaks exactly one rule and must redden the check
    /// that names it: a check that cannot fail proves nothing.
    #[test]
    fn design_checks_redden_on_each_seeded_violation() {
        let mutate = |path: &str, f: &dyn Fn(&str) -> String| -> Vec<String> {
            let mut files = react_files();
            let file = files.iter_mut().find(|x| x.path == path).unwrap();
            file.content = f(&file.content);
            design_violations(&files, RUNNER_PACKAGE_JSON)
        };
        let reddens = |violations: Vec<String>, needle: &str| {
            assert!(
                violations.iter().any(|v| v.contains(needle)),
                "expected a violation containing `{needle}`, got {violations:#?}"
            );
        };
        assert!(design_violations(&react_files(), RUNNER_PACKAGE_JSON).is_empty());

        let mut missing = react_files();
        missing.retain(|f| f.path != "specimen.html");
        reddens(design_violations(&missing, RUNNER_PACKAGE_JSON), "missing path specimen.html");

        reddens(
            mutate("src/App.tsx", &|c| format!("{c}\n{{{{name}}}}")),
            "placeholder left in src/App.tsx",
        );
        reddens(
            mutate("package.json", &|c| c.replace("design-kit compile --check", "design-kit compile")),
            "lacks `design-kit compile --check`",
        );
        reddens(
            mutate("package.json", &|c| c.replace("design-kit lint-classes src && ", "")),
            "lacks `design-kit lint-classes src`",
        );
        for bad in ["github:qontinui/qontinui-design-kit#main", "^0.1.0", "github:qontinui/qontinui-design-kit"] {
            reddens(
                mutate("package.json", &|c| {
                    c.replace("github:qontinui/qontinui-design-kit#v0.1.0", bad)
                }),
                "not a git ref in tag form",
            );
        }
        reddens(
            mutate("package.json", &|c| {
                let pin = format!("\"@qontinui/ui-bridge\": \"{}\"", "^0.21.1");
                let at = c.find("\"@qontinui/ui-bridge\": \"").unwrap();
                let end = at + c[at..].find(',').unwrap();
                format!("{}{}{}", &c[..at], pin, &c[end..])
            }),
            "is below the runner's",
        );
        reddens(
            mutate("package.json", &|c| c.replace("\"tailwindcss\": \"^4", "\"tailwindcss\": \"^3")),
            "is not Tailwind v4",
        );
        // An agent-authored hue.
        reddens(
            mutate("design/language.dtcg.json", &|c| {
                c.replacen("\"source\": \"undeclared\"", "\"source\": \"authored(x)\"", 1)
            }),
            "identity leaf color.role.surface is agent-authored",
        );
        // An authored leaf with no notification reference.
        reddens(
            mutate("design/language.dtcg.json", &|c| {
                c.replacen("authored(a784185b-4f36-4ad1-b57a-30ef4fbfc9ee)", "authored()", 1)
            }),
            "carries no notification_ref",
        );
        reddens(
            mutate("CLAUDE.md", &|c| c.replace(INDEX_END, "")),
            "lacks the index markers",
        );
        reddens(
            mutate("CLAUDE.md", &|c| c.replace(INDEX_START, INDEX_END).replace(INDEX_END, INDEX_START)),
            "lacks the index markers",
        );
        for (needle, replacement) in [
            ("- run: npm install", "- run: npm ci"),
            ("node-version: '24'", "node-version: '24'\n          cache: npm"),
            ("- run: npm run build", "- run: npm run build\n      - run: git diff --exit-code"),
            ("- run: npm run build", "- run: npm run build\n      - run: echo ${{ github.sha }}"),
        ] {
            let v = mutate(".github/workflows/ci.yml", &|c| c.replace(needle, replacement));
            assert!(!v.is_empty(), "ci.yml mutation `{replacement}` stayed green");
        }
    }

    #[test]
    fn version_helpers_read_the_forms_the_template_uses() {
        assert_eq!(version_floor("^0.53.0"), Some((0, 53, 0)));
        assert_eq!(version_floor("0.7.0"), Some((0, 7, 0)));
        assert_eq!(version_floor("~1.2.3"), Some((1, 2, 3)));
        assert_eq!(version_floor("github:a/b#v0.1.0"), None);
        assert_eq!(version_floor("^1.2"), None);
        assert!(is_git_tag_ref("github:qontinui/qontinui-design-kit#v0.1.0"));
        assert!(!is_git_tag_ref("github:qontinui/qontinui-design-kit#main"));
        assert!(!is_git_tag_ref("github:qontinui/qontinui-design-kit#abc1234"));
        assert!(!is_git_tag_ref("^0.1.0"));
    }

