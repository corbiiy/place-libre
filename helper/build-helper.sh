#!/bin/zsh
set -euo pipefail

project_dir="${0:A:h:h}"
build_dir="$project_dir/.helper-build"
app_path="$build_dir/Place Libre Helper.app"
archive_path="$project_dir/public/downloads/place-libre-helper.zip"

mkdir -p "$build_dir" "$project_dir/public/downloads"
rm -rf "$app_path"
/usr/bin/osacompile -o "$app_path" "$project_dir/helper/Place Libre Helper.applescript"
/bin/cp "$project_dir/helper/scanner.js" "$app_path/Contents/Resources/scanner.js"

/usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string com.cdilyas.placelibre.helper" "$app_path/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes array" "$app_path/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0 dict" "$app_path/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLName string Place Libre Helper" "$app_path/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$app_path/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string placelibrehelper" "$app_path/Contents/Info.plist"
/usr/bin/codesign --force --deep --sign - "$app_path"
/usr/bin/ditto -c -k --sequesterRsrc --keepParent "$app_path" "$archive_path"
/bin/rm -rf "$build_dir"
echo "$archive_path"
