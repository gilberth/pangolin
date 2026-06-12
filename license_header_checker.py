import os
import sys

# --- Configuration ---
# The header text to be added to the files.
HEADER_TEXT = """/*
 * This file is part of a proprietary work.
 *
 * Copyright (c) 2025-2026 Fossorial, Inc.
 * All rights reserved.
 *
 * This file is licensed under the Fossorial Commercial License.
 * You may not use this file except in compliance with the License.
 * Unauthorized use, copying, modification, or distribution is strictly prohibited.
 *
 * This file is not licensed under the AGPLv3.
 */
"""

HEADER_NORMALIZED = HEADER_TEXT.strip()


def extract_leading_block_comment(content):
    """
    If the file content begins with a /* ... */ block comment, return the
    full text of that comment (including the delimiters) and the index at
    which the rest of the file starts (after any trailing newlines).
    Returns (None, 0) when no such comment is found.
    """
    stripped = content.lstrip()
    if not stripped.startswith('/*'):
        return None, 0

    # Account for any leading whitespace before the comment
    comment_start = content.index('/*')
    end_marker = content.find('*/', comment_start + 2)
    if end_marker == -1:
        return None, 0

    comment_end = end_marker + 2  # position just after '*/'
    comment_text = content[comment_start:comment_end].strip()

    # Advance past any whitespace / newlines that follow the closing */
    rest_start = comment_end
    while rest_start < len(content) and content[rest_start] in '\n\r':
        rest_start += 1

    return comment_text, rest_start


def should_add_header(file_path):
    """
    Checks if a file should receive the commercial license header.
    Returns True if 'server/private' is in the path.
    """
    if 'server/private' in file_path.lower():
        return True

    return False


def process_directory(root_dir):
    """
    Recursively scans a directory and adds/replaces/removes headers in
    qualifying .ts or .tsx files, skipping any 'node_modules' directories.
    """
    print(f"Scanning directory: {root_dir}")
    files_processed = 0
    files_modified = 0

    for root, dirs, files in os.walk(root_dir):
        # Exclude 'node_modules' directories from the scan.
        if 'node_modules' in dirs:
            dirs.remove('node_modules')

        for file in files:
            if not (file.endswith('.ts') or file.endswith('.tsx')):
                continue

            file_path = os.path.join(root, file)
            files_processed += 1

            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    original_content = f.read()

                existing_comment, body_start = extract_leading_block_comment(
                    original_content
                )
                has_any_header = existing_comment is not None
                has_correct_header = existing_comment == HEADER_NORMALIZED

                body = original_content[body_start:] if has_any_header else original_content

                if should_add_header(file_path):
                    if has_correct_header:
                        print(f"Header up-to-date:  {file_path}")
                    else:
                        # Either no header exists or the header is outdated - write
                        # the correct one.
                        action = "Replaced header in" if has_any_header else "Added header to"
                        new_content = HEADER_NORMALIZED + '\n\n' + body
                        with open(file_path, 'w', encoding='utf-8') as f:
                            f.write(new_content)
                        print(f"{action}: {file_path}")
                        files_modified += 1
                else:
                    if has_any_header:
                        # Remove the header - it shouldn't be here.
                        with open(file_path, 'w', encoding='utf-8') as f:
                            f.write(body)
                        print(f"Removed header from: {file_path}")
                        files_modified += 1
                    else:
                        print(f"No header needed:   {file_path}")

            except Exception as e:
                print(f"Error processing file {file_path}: {e}")

    print("\n--- Scan Complete ---")
    print(f"Total .ts or .tsx files found:          {files_processed}")
    print(f"Files modified (added/replaced/removed): {files_modified}")


if __name__ == "__main__":
    # Get the target directory from the command line arguments.
    # If no directory is provided, it uses the current directory ('.').
    if len(sys.argv) > 1:
        target_directory = sys.argv[1]
    else:
        target_directory = '.'  # Default to current directory

    if not os.path.isdir(target_directory):
        print(f"Error: Directory '{target_directory}' not found.")
        sys.exit(1)

    process_directory(os.path.abspath(target_directory))
