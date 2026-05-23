export function ownedRooms(): Room[] {
    const rooms: { [roomName: string]: Room } = {};
    for (const spawnName in Game.spawns) {
        const room = Game.spawns[spawnName].room;
        rooms[room.name] = room;
    }
    return Object.keys(rooms).map((roomName) => rooms[roomName]);
}
