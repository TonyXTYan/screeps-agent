A remnant of dead creeps. This is a walkable object.
| **Decay** | 5 ticks per body part of the deceased creep |
| --- | --- |

## Inherited from [RoomObject](#RoomObject)effectsarray

Applied effects, an array of objects with the following properties:
| parameter | type | description |
| --- | --- | --- |
| `effect` | number | Effect ID of the applied effect. Can be either natural effect ID or Power ID. |
| `level`
*optional* | number | Power level of the applied effect. Absent if the effect is not a Power effect. |
| `ticksRemaining` | number | How many ticks will the effect last. |

## Inherited from [RoomObject](#RoomObject)pos[RoomPosition](#RoomPosition)

An object representing the position of this object in the room.

## Inherited from [RoomObject](#RoomObject)room[Room](#Room)

The link to the Room object. May be undefined in case if an object is a flag or a construction site and is placed in a room that is not visible to you.

## creep[Creep](#Creep) | [PowerCreep](#PowerCreep)

```js
room.find(FIND_TOMBSTONES).forEach(tombstone => {
if(tombstone.creep.my) {
console.log(`My creep died with ID=${tombstone.creep.id} ` +
`and role=${Memory.creeps[tombstone.creep.name].role}`);
}
});
```

```js
room.find(FIND_TOMBSTONES).forEach(tombstone => {
if(tombstone.creep instanceof PowerCreep) {
console.log(`Power creep died here`);
}
});
`
```
An object containing the deceased creep or power creep.

## deathTimenumber

Time of death.

## idstring

A unique object identificator. You can use [`Game.getObjectById`](#Game.getObjectById) method to retrieve an object instance by its `id`.

## store[Store](#Store)

A [`Store`](#Store) object that contains cargo of this structure.

## ticksToDecaynumber

The amount of game ticks before this tombstone decays.