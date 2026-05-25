#!/usr/bin/env python3
"""
Rewrite relative TypeScript import paths to match the new folder layout.
Run this from the repo root BEFORE git mv.
"""
import os
import re

SRC = os.path.join(os.getcwd(), 'src')

# old stem (import string minus './')  →  new path relative to src/ (no .ts)
STEM_MAP = {
    'creep.capabilities':    'creep/capabilities',
    'creep.harvest':         'creep/harvest',
    'creep.jobRunner':       'creep/jobRunner',
    'creep.memoryManagement':'creep/memoryManagement',
    'creep.movement':        'creep/movement',
    'creep.populationControl':'creep/populationControl',
    'creep.roleBalance':     'creep/roleBalance',
    'creep.traffic':         'creep/traffic',
    'role.builder':          'role/builder',
    'role.defender':         'role/defender',
    'role.doctor':           'role/doctor',
    'role.harvester':        'role/harvester',
    'role.manual':           'role/manual',
    'role.upgrader':         'role/upgrader',
    'room.constants':        'room/constants',
    'room.controller':       'room/controller',
    'room.energy':           'room/energy',
    'room.jobManage':        'room/jobManage',
    'room.jobMemory':        'room/jobMemory',
    'room.remote.energy':    'room/remote/energy',
    'room.remote.fleet':     'room/remote/fleet',
    'room.remote.haulers':   'room/remote/haulers',
    'room.remote.miners':    'room/remote/miners',
    'room.remote.planning':  'room/remote/planning',
    'room.remote.roads':     'room/remote/roads',
    'room.remote.routing':   'room/remote/routing',
    'room.remote.spawn':     'room/remote/spawn',
    'room.source':           'room/source',
    'room.spawn':            'room/spawn',
    'room.storeUtils':       'room/storeUtils',
    'room.structures':       'room/structures',
    'room.targeting':        'room/targeting',
    'room.types':            'room/types',
    'room.work':             'room/work',
    'spawn.renewal':         'spawn/renewal',
    'tower.basics':          'tower/basics',
    # files staying at src/ root
    'debug':         'debug',
    'env':           'env',
    'hostileUtils':  'hostileUtils',
    'main':          'main',
    'memoryAudit':   'memoryAudit',
}

# old filename (relative to src/, with .ts)  →  new filename (relative to src/, with .ts)
FILE_MOVES = {
    'creep.capabilities.ts':    'creep/capabilities.ts',
    'creep.harvest.ts':         'creep/harvest.ts',
    'creep.jobRunner.ts':       'creep/jobRunner.ts',
    'creep.memoryManagement.ts':'creep/memoryManagement.ts',
    'creep.movement.ts':        'creep/movement.ts',
    'creep.populationControl.ts':'creep/populationControl.ts',
    'creep.roleBalance.ts':     'creep/roleBalance.ts',
    'creep.traffic.ts':         'creep/traffic.ts',
    'role.builder.ts':          'role/builder.ts',
    'role.defender.ts':         'role/defender.ts',
    'role.doctor.ts':           'role/doctor.ts',
    'role.harvester.ts':        'role/harvester.ts',
    'role.manual.ts':           'role/manual.ts',
    'role.upgrader.ts':         'role/upgrader.ts',
    'room.constants.ts':        'room/constants.ts',
    'room.controller.ts':       'room/controller.ts',
    'room.energy.ts':           'room/energy.ts',
    'room.jobManage.ts':        'room/jobManage.ts',
    'room.jobMemory.ts':        'room/jobMemory.ts',
    'room.remote.energy.ts':    'room/remote/energy.ts',
    'room.remote.fleet.ts':     'room/remote/fleet.ts',
    'room.remote.haulers.ts':   'room/remote/haulers.ts',
    'room.remote.miners.ts':    'room/remote/miners.ts',
    'room.remote.planning.ts':  'room/remote/planning.ts',
    'room.remote.roads.ts':     'room/remote/roads.ts',
    'room.remote.routing.ts':   'room/remote/routing.ts',
    'room.remote.spawn.ts':     'room/remote/spawn.ts',
    'room.source.ts':           'room/source.ts',
    'room.spawn.ts':            'room/spawn.ts',
    'room.storeUtils.ts':       'room/storeUtils.ts',
    'room.structures.ts':       'room/structures.ts',
    'room.targeting.ts':        'room/targeting.ts',
    'room.types.ts':            'room/types.ts',
    'room.work.ts':             'room/work.ts',
    'spawn.renewal.ts':         'spawn/renewal.ts',
    'tower.basics.ts':          'tower/basics.ts',
    # identity entries for files staying in src/ root
    'debug.ts':         'debug.ts',
    'env.ts':           'env.ts',
    'hostileUtils.ts':  'hostileUtils.ts',
    'main.ts':          'main.ts',
    'memoryAudit.ts':   'memoryAudit.ts',
    'types.d.ts':       'types.d.ts',
}

# matches:  from 'X'  or  from "X"  where X starts with ./ or ../
IMPORT_RE = re.compile(r"""(from\s+)(['"])(\.\.?/[^'"]+)\2""")

def rewrite_imports(content, old_stem, new_stem):
    """
    old_stem / new_stem: path relative to src/ WITHOUT .ts extension.
    e.g. old='room.remote.fleet', new='room/remote/fleet'
    """
    old_dir = os.path.dirname(old_stem)   # '' for flat src/ files
    new_dir = os.path.dirname(new_stem)   # 'room/remote' for nested files

    def replace(m):
        kw   = m.group(1)   # 'from '
        q    = m.group(2)   # quote char
        imp  = m.group(3)   # e.g. './room.structures'

        # Resolve import relative to old file's directory
        if old_dir:
            resolved = os.path.normpath(os.path.join(old_dir, imp)).replace('\\', '/')
        else:
            # old_dir == '' → file is in src/ root
            if imp.startswith('./'):
                resolved = imp[2:]
            elif imp.startswith('../'):
                # unusual for src-root files; leave unchanged
                return m.group(0)
            else:
                resolved = imp

        if resolved not in STEM_MAP:
            # Unknown import (external package etc.) – leave unchanged
            return m.group(0)

        new_target = STEM_MAP[resolved]  # new path relative to src/

        # Compute relative path from new file's directory to new target
        if new_dir:
            rel = os.path.relpath(new_target, new_dir).replace('\\', '/')
        else:
            rel = new_target   # stays in src/ root

        if not rel.startswith('.'):
            rel = './' + rel

        return f'{kw}{q}{rel}{q}'

    return IMPORT_RE.sub(replace, content)


def main():
    changed = 0
    for old_rel, new_rel in FILE_MOVES.items():
        old_abs = os.path.join(SRC, old_rel)
        if not os.path.exists(old_abs):
            print(f'  SKIP (not found): {old_rel}')
            continue

        old_stem = old_rel[:-3] if old_rel.endswith('.ts') else old_rel
        new_stem = new_rel[:-3] if new_rel.endswith('.ts') else new_rel

        with open(old_abs, 'r', encoding='utf-8') as f:
            original = f.read()

        updated = rewrite_imports(original, old_stem, new_stem)

        if updated != original:
            with open(old_abs, 'w', encoding='utf-8') as f:
                f.write(updated)
            print(f'  updated: {old_rel}')
            changed += 1
        else:
            print(f'  no-op:   {old_rel}')

    print(f'\nDone — {changed} files updated.')

if __name__ == '__main__':
    main()
