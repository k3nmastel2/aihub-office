import {
  DOOR_LENGTH,
  DOOR_THICKNESS,
  EAST_WING_DOOR_Y,
  EAST_WING_ROOM_HEIGHT,
  EAST_WING_ROOM_TOP_Y,
  GYM_ROOM_END_X,
  GYM_ROOM_X,
  QA_LAB_END_X,
  QA_LAB_X,
  WALL_THICKNESS,
} from "@/features/retro-office/core/constants";
import { nextUid } from "@/features/retro-office/core/geometry";
import {
  hasAtmMigrationApplied,
  hasGymRoomMigrationApplied,
  hasPhoneBoothMigrationApplied,
  hasQaLabMigrationApplied,
  hasSmsBoothMigrationApplied,
  hasServerRoomMigrationApplied,
} from "@/features/retro-office/core/persistence";
import type {
  FurnitureItem,
  FurnitureSeed,
} from "@/features/retro-office/core/types";
import type { PodDeskSlot } from "@/lib/aihub/seating";

export type OfficeLayoutPreset = "office" | "lobby" | "aihub";

const DEFAULT_PINGPONG_TABLE: FurnitureSeed = {
  type: "pingpong",
  x: 950,
  y: 600,
  w: 100,
  h: 60,
};

const DEFAULT_ATM_MACHINE: FurnitureSeed = {
  type: "atm",
  x: 430,
  y: 210,
  facing: 90,
};

const DEFAULT_PHONE_BOOTH: FurnitureSeed = {
  type: "phone_booth",
  x: 1050,
  y: 190,
  facing: 270,
};

const DEFAULT_SMS_BOOTH: FurnitureSeed = {
  type: "sms_booth",
  x: 700,
  y: 10,
  facing: 0,
};

const DEFAULT_JUKEBOX: FurnitureSeed = {
  type: "jukebox",
  x: 20,
  y: 380,
  facing: 90,
};

const DEFAULT_KANBAN_BOARD: FurnitureSeed = {
  type: "kanban_board",
  x: 460,
  y: -60,
  facing: 180,
};

const PREVIOUS_SERVER_ROOM_ITEMS_BOTTOM_RIGHT: FurnitureSeed[] = [
  { type: "wall", x: 820, y: 540, w: 280, h: WALL_THICKNESS },
  { type: "wall", x: 820, y: 540, w: WALL_THICKNESS, h: 70 },
  { type: "wall", x: 820, y: 650, w: WALL_THICKNESS, h: 70 },
  {
    type: "door",
    x: 820,
    y: 610,
    w: DOOR_LENGTH,
    h: DOOR_THICKNESS,
    facing: 90,
  },
  { type: "server_rack", x: 885, y: 575, facing: 180 },
  { type: "server_rack", x: 955, y: 575, facing: 180 },
  { type: "server_terminal", x: 930, y: 640, facing: 0 },
];

const PREVIOUS_SERVER_ROOM_ITEMS_TOP_RIGHT: FurnitureSeed[] = [
  { type: "wall", x: 820, y: 0, w: WALL_THICKNESS, h: 130 },
  { type: "wall", x: 820, y: 170, w: WALL_THICKNESS, h: 60 },
  {
    type: "door",
    x: 820,
    y: 130,
    w: DOOR_LENGTH,
    h: DOOR_THICKNESS,
    facing: 90,
  },
  { type: "wall", x: 820, y: 230, w: 280, h: WALL_THICKNESS },
  { type: "server_rack", x: 875, y: 95, facing: 180 },
  { type: "server_rack", x: 950, y: 95, facing: 180 },
  { type: "server_terminal", x: 930, y: 185, facing: 0 },
];

const DEFAULT_DINING_ITEMS: FurnitureSeed[] = [
  { type: "round_table", x: 890, y: 100, r: 50 },
  { type: "chair", x: 930, y: 100, facing: 0 },
  { type: "chair", x: 930, y: 180, facing: 180 },
  { type: "chair", x: 880, y: 130, facing: 90 },
  { type: "chair", x: 970, y: 130, facing: 270 },
];

const DEFAULT_SERVER_ROOM_ITEMS: FurnitureSeed[] = [
  { type: "wall", x: 0, y: 560, w: 230, h: WALL_THICKNESS },
  { type: "wall", x: 220, y: 560, w: WALL_THICKNESS, h: 60 },
  {
    type: "door",
    x: 210,
    y: 630,
    w: DOOR_LENGTH,
    h: DOOR_THICKNESS,
    facing: 90,
  },
  { type: "wall", x: 220, y: 660, w: WALL_THICKNESS, h: 60 },
  { type: "server_rack", x: 50, y: 595, facing: 0 },
  { type: "server_rack", x: 125, y: 595, facing: 0 },
  { type: "server_terminal", x: 110, y: 645, facing: 180 },
];

const LEGACY_GYM_ROOM_ITEMS: FurnitureSeed[] = [
  { type: "wall", x: 1092, y: 0, w: WALL_THICKNESS, h: 260 },
  {
    type: "door",
    x: 1092,
    y: 260,
    w: DOOR_LENGTH,
    h: DOOR_THICKNESS,
    facing: 90,
  },
  { type: "wall", x: 1092, y: 300, w: WALL_THICKNESS, h: 420 },
  { type: "wall", x: 1092, y: 0, w: 358, h: WALL_THICKNESS },
  { type: "wall", x: 1092, y: 712, w: 358, h: WALL_THICKNESS },
  { type: "wall", x: 1442, y: 0, w: WALL_THICKNESS, h: 260 },
  {
    type: "door",
    x: 1442,
    y: 260,
    w: DOOR_LENGTH,
    h: DOOR_THICKNESS,
    facing: 90,
  },
  { type: "wall", x: 1442, y: 300, w: WALL_THICKNESS, h: 420 },
  { type: "treadmill", x: 1160, y: 90, facing: 90 },
  { type: "treadmill", x: 1160, y: 210, facing: 90 },
  { type: "rowing_machine", x: 1150, y: 340, facing: 90 },
  { type: "weight_bench", x: 1240, y: 120, facing: 90 },
  { type: "weight_bench", x: 1240, y: 260, facing: 90 },
  { type: "dumbbell_rack", x: 1320, y: 90, facing: 180 },
  { type: "dumbbell_rack", x: 1320, y: 220, facing: 180 },
  { type: "kettlebell_rack", x: 1310, y: 330, facing: 180 },
  { type: "exercise_bike", x: 1180, y: 410, facing: 90 },
  { type: "exercise_bike", x: 1180, y: 540, facing: 90 },
  { type: "punching_bag", x: 1360, y: 390, facing: 0 },
  { type: "punching_bag", x: 1360, y: 560, facing: 0 },
  { type: "yoga_mat", x: 1240, y: 470, facing: 0, color: "#0f766e" },
  { type: "yoga_mat", x: 1240, y: 560, facing: 0, color: "#7c3aed" },
  { type: "plant", x: 1400, y: 40 },
  { type: "plant", x: 1400, y: 660 },
];

const LEGACY_QA_LAB_ITEMS: FurnitureSeed[] = [
  { type: "wall", x: 1442, y: 0, w: 358, h: WALL_THICKNESS },
  { type: "wall", x: 1442, y: 712, w: 358, h: WALL_THICKNESS },
  { type: "wall", x: 1792, y: 0, w: WALL_THICKNESS, h: 720 },
  { type: "qa_terminal", x: 1530, y: 95, facing: 90 },
  { type: "device_rack", x: 1650, y: 90, facing: 180 },
  { type: "device_rack", x: 1650, y: 220, facing: 180 },
  { type: "test_bench", x: 1520, y: 320, facing: 90 },
  { type: "test_bench", x: 1520, y: 470, facing: 90 },
  { type: "plant", x: 1750, y: 40 },
  { type: "plant", x: 1750, y: 660 },
];

const EAST_WING_ROOM_BOTTOM_Y = EAST_WING_ROOM_TOP_Y + EAST_WING_ROOM_HEIGHT;
const EAST_WING_ROOM_BOTTOM_WALL_Y = EAST_WING_ROOM_BOTTOM_Y - WALL_THICKNESS;
const EAST_WING_DOOR_BOTTOM_Y = EAST_WING_DOOR_Y + DOOR_LENGTH;
const EAST_WING_TOP_WALL_HEIGHT = EAST_WING_DOOR_Y - EAST_WING_ROOM_TOP_Y;
const EAST_WING_BOTTOM_WALL_HEIGHT =
  EAST_WING_ROOM_BOTTOM_Y - EAST_WING_DOOR_BOTTOM_Y;

const PREVIOUS_GYM_ROOM_ITEMS: FurnitureSeed[] = [
  {
    type: "wall",
    x: GYM_ROOM_X,
    y: EAST_WING_ROOM_TOP_Y,
    w: WALL_THICKNESS,
    h: EAST_WING_ROOM_HEIGHT,
  },
  {
    type: "wall",
    x: GYM_ROOM_X,
    y: EAST_WING_ROOM_TOP_Y,
    w: GYM_ROOM_END_X - GYM_ROOM_X + WALL_THICKNESS,
    h: WALL_THICKNESS,
  },
  {
    type: "wall",
    x: GYM_ROOM_X,
    y: EAST_WING_ROOM_BOTTOM_WALL_Y,
    w: GYM_ROOM_END_X - GYM_ROOM_X + WALL_THICKNESS,
    h: WALL_THICKNESS,
  },
  {
    type: "wall",
    x: GYM_ROOM_END_X,
    y: EAST_WING_ROOM_TOP_Y,
    w: WALL_THICKNESS,
    h: EAST_WING_TOP_WALL_HEIGHT,
  },
  {
    type: "door",
    x: GYM_ROOM_END_X,
    y: EAST_WING_DOOR_Y,
    w: DOOR_LENGTH,
    h: DOOR_THICKNESS,
    facing: 90,
  },
  {
    type: "wall",
    x: GYM_ROOM_END_X,
    y: EAST_WING_DOOR_BOTTOM_Y,
    w: WALL_THICKNESS,
    h: EAST_WING_BOTTOM_WALL_HEIGHT,
  },
  { type: "treadmill", x: 1188, y: 88, facing: 90 },
  { type: "weight_bench", x: 1250, y: 92, facing: 90 },
  { type: "dumbbell_rack", x: 1272, y: 160, facing: 180 },
  { type: "rowing_machine", x: 1186, y: 248, facing: 90 },
  { type: "kettlebell_rack", x: 1278, y: 268, facing: 180 },
  { type: "exercise_bike", x: 1192, y: 370, facing: 90 },
  { type: "punching_bag", x: 1310, y: 394, facing: 0 },
  { type: "yoga_mat", x: 1218, y: 544, facing: 0, color: "#0f766e" },
  { type: "plant", x: 1312, y: 82 },
  { type: "plant", x: 1312, y: 622 },
];

const PREVIOUS_QA_LAB_ITEMS: FurnitureSeed[] = [
  {
    type: "wall",
    x: QA_LAB_X,
    y: EAST_WING_ROOM_TOP_Y,
    w: WALL_THICKNESS,
    h: EAST_WING_TOP_WALL_HEIGHT,
  },
  {
    type: "door",
    x: QA_LAB_X,
    y: EAST_WING_DOOR_Y,
    w: DOOR_LENGTH,
    h: DOOR_THICKNESS,
    facing: 90,
  },
  {
    type: "wall",
    x: QA_LAB_X,
    y: EAST_WING_DOOR_BOTTOM_Y,
    w: WALL_THICKNESS,
    h: EAST_WING_BOTTOM_WALL_HEIGHT,
  },
  {
    type: "wall",
    x: QA_LAB_X,
    y: EAST_WING_ROOM_TOP_Y,
    w: QA_LAB_END_X - QA_LAB_X + WALL_THICKNESS,
    h: WALL_THICKNESS,
  },
  {
    type: "wall",
    x: QA_LAB_X,
    y: EAST_WING_ROOM_BOTTOM_WALL_Y,
    w: QA_LAB_END_X - QA_LAB_X + WALL_THICKNESS,
    h: WALL_THICKNESS,
  },
  {
    type: "wall",
    x: QA_LAB_END_X,
    y: EAST_WING_ROOM_TOP_Y,
    w: WALL_THICKNESS,
    h: EAST_WING_ROOM_HEIGHT,
  },
  { type: "qa_terminal", x: 1496, y: 92, facing: 90 },
  { type: "device_rack", x: 1568, y: 88, facing: 180 },
  { type: "device_rack", x: 1568, y: 194, facing: 180 },
  { type: "test_bench", x: 1492, y: 300, facing: 90 },
  { type: "test_bench", x: 1492, y: 434, facing: 90 },
  { type: "plant", x: 1604, y: 82 },
  { type: "plant", x: 1604, y: 622 },
];

const DEFAULT_GYM_ITEMS: FurnitureSeed[] = [
  {
    type: "wall",
    x: GYM_ROOM_X,
    y: EAST_WING_ROOM_TOP_Y,
    w: WALL_THICKNESS,
    h: EAST_WING_ROOM_HEIGHT,
  },
  {
    type: "wall",
    x: GYM_ROOM_X,
    y: EAST_WING_ROOM_TOP_Y,
    w: GYM_ROOM_END_X - GYM_ROOM_X + WALL_THICKNESS,
    h: WALL_THICKNESS,
  },
  {
    type: "wall",
    x: GYM_ROOM_X,
    y: EAST_WING_ROOM_BOTTOM_WALL_Y,
    w: GYM_ROOM_END_X - GYM_ROOM_X + WALL_THICKNESS,
    h: WALL_THICKNESS,
  },
  {
    type: "wall",
    x: GYM_ROOM_END_X,
    y: EAST_WING_ROOM_TOP_Y,
    w: WALL_THICKNESS,
    h: 220,
  },
  {
    type: "door",
    x: 1280,
    y: 280,
    w: DOOR_LENGTH,
    h: DOOR_THICKNESS,
    facing: 90,
  },
  {
    type: "wall",
    x: GYM_ROOM_END_X,
    y: 300,
    w: WALL_THICKNESS,
    h: 380,
  },
  { type: "treadmill", x: 1142, y: 90, facing: 90 },
  { type: "weight_bench", x: 1204, y: 92, facing: 90 },
  { type: "dumbbell_rack", x: 1220, y: 160, facing: 180 },
  { type: "rowing_machine", x: 1140, y: 222, facing: 90 },
  { type: "kettlebell_rack", x: 1224, y: 248, facing: 180 },
  { type: "exercise_bike", x: 1146, y: 366, facing: 90 },
  { type: "punching_bag", x: 1266, y: 380, facing: 0 },
  { type: "yoga_mat", x: 1168, y: 542, facing: 0, color: "#0f766e" },
  { type: "plant", x: 1268, y: 82 },
  { type: "plant", x: 1268, y: 622 },
];

const DEFAULT_QA_LAB_ITEMS: FurnitureSeed[] = [
  {
    type: "wall",
    x: QA_LAB_X,
    y: EAST_WING_ROOM_TOP_Y,
    w: WALL_THICKNESS,
    h: 220,
  },
  {
    type: "door",
    x: 1340,
    y: 280,
    w: DOOR_LENGTH,
    h: DOOR_THICKNESS,
    facing: 90,
  },
  {
    type: "wall",
    x: QA_LAB_X,
    y: 300,
    w: WALL_THICKNESS,
    h: 380,
  },
  {
    type: "wall",
    x: QA_LAB_X,
    y: EAST_WING_ROOM_TOP_Y,
    w: QA_LAB_END_X - QA_LAB_X + WALL_THICKNESS,
    h: WALL_THICKNESS,
  },
  {
    type: "wall",
    x: QA_LAB_X,
    y: EAST_WING_ROOM_BOTTOM_WALL_Y,
    w: QA_LAB_END_X - QA_LAB_X + WALL_THICKNESS,
    h: WALL_THICKNESS,
  },
  {
    type: "wall",
    x: QA_LAB_END_X,
    y: EAST_WING_ROOM_TOP_Y,
    w: WALL_THICKNESS,
    h: EAST_WING_ROOM_HEIGHT,
  },
  { type: "qa_terminal", x: 1374, y: 92, facing: 90 },
  { type: "device_rack", x: 1454, y: 92, facing: 180 },
  { type: "device_rack", x: 1454, y: 204, facing: 180 },
  { type: "test_bench", x: 1372, y: 316, facing: 90 },
  { type: "test_bench", x: 1372, y: 450, facing: 90 },
  { type: "plant", x: 1496, y: 82 },
  { type: "plant", x: 1496, y: 622 },
];

const DEFAULT_ART_ROOM_ITEMS: FurnitureSeed[] = [
  { type: "wall", x: 260, y: 40, w: 8, h: 230 },
  { type: "wall", x: 260, y: 40, w: 178, h: 8 },
  { type: "wall", x: 260, y: 262, w: 178, h: 8 },
  { type: "wall", x: 430, y: 40, w: 8, h: 90 },
  { type: "door", x: 420, y: 150, w: 40, h: 8, facing: 90 },
  { type: "wall", x: 430, y: 170, w: 8, h: 100 },
  { type: "easel", x: 278, y: 84, facing: 90 },
  { type: "easel", x: 278, y: 158, facing: 90 },
  { type: "plant", x: 280, y: 60 },
  { type: "plant", x: 280, y: 240 },
];

const DEFAULT_LOBBY_FURNITURE: FurnitureSeed[] = [
  { type: "round_table", x: 120, y: 110, r: 72 },
  { type: "chair", x: 182, y: 110, facing: 0 },
  { type: "chair", x: 160, y: 168, facing: 220 },
  { type: "chair", x: 92, y: 170, facing: 140 },
  { type: "chair", x: 58, y: 112, facing: 90 },
  { type: "chair", x: 92, y: 52, facing: 40 },
  { type: "bookshelf", x: 248, y: 32, w: 78, h: 118 },
  { type: "couch", x: 332, y: 92, w: 44, h: 112, vertical: true, facing: 180 },
  { type: "couch", x: 430, y: 92, w: 44, h: 112, vertical: true, facing: 180 },
  { type: "table_rect", x: 382, y: 138, w: 72, h: 34 },
  { type: "beanbag", x: 332, y: 210, color: "#1565c0", facing: 135 },
  { type: "beanbag", x: 436, y: 216, color: "#7c3aed", facing: 225 },
  { type: "whiteboard", x: 36, y: 214, w: 10, h: 64 },
  { type: "clock", x: 566, y: 6 },
  { type: "table_rect", x: 874, y: 102, w: 124, h: 34, facing: 0 },
  { type: "chair", x: 934, y: 176, facing: 180 },
  { type: "vending", x: 788, y: 10 },
  { type: "trash", x: 826, y: 20 },
  { type: "couch", x: 982, y: 382, w: 112, h: 42, facing: 90 },
  { type: "couch", x: 392, y: 634, w: 112, h: 42 },
  { type: "table_rect", x: 980, y: 380, w: 60, h: 30, facing: 270 },
  { type: "plant", x: 40, y: 40 },
  { type: "plant", x: 662, y: 32 },
  { type: "plant", x: 340, y: 700 },
  { type: "plant", x: 1088, y: 312 },
  { type: "plant", x: 530, y: 700 },
  ...DEFAULT_SERVER_ROOM_ITEMS,
  ...DEFAULT_GYM_ITEMS,
  ...DEFAULT_QA_LAB_ITEMS,
  ...DEFAULT_ART_ROOM_ITEMS,
];

const DEFAULT_FURNITURE: FurnitureSeed[] = [
  { type: "round_table", x: 50, y: 50, r: 90 },
  { type: "chair", x: 130, y: 50, facing: 0 },
  { type: "chair", x: 200, y: 90, facing: 325 },
  { type: "chair", x: 180, y: 170, facing: 240 },
  { type: "chair", x: 120, y: 480, facing: 180 },
  { type: "chair", x: 50, y: 150, facing: 105 },
  { type: "chair", x: 60, y: 80, facing: 60 },
  { type: "chair", x: 550, y: 50, facing: 0 },
  { type: "bookshelf", x: 600, y: 30, w: 80, h: 120 },
  { type: "couch", x: 270, y: 90, w: 40, h: 80, vertical: true, facing: 180 },
  { type: "fridge", x: 1050, y: 20, w: 40, h: 80 },
  { type: "stove", x: 920, y: 20 },
  { type: "cabinet", x: 980, y: 30, w: 40, h: 40 },
  { type: "microwave", x: 1030, y: 10, facing: 0 },
  { type: "sink", x: 970, y: 20 },
  { type: "dishwasher", x: 950, y: 20, w: 40, h: 40 },
  { type: "cabinet", x: 840, y: 30, w: 80, h: 40, elevation: 0 },
  { type: "coffee_machine", x: 880, y: 30, elevation: 0.56 },
  { type: "wall_cabinet", x: 960, y: 10, w: 80, h: 20, elevation: 0.9 },
  { type: "wall_cabinet", x: 880, y: 10, w: 80, h: 20, elevation: 0.9 },
  { type: "round_table", x: 890, y: 100, r: 50 },
  { type: "chair", x: 930, y: 100, facing: 0 },
  { type: "chair", x: 930, y: 180, facing: 180 },
  { type: "chair", x: 880, y: 130, facing: 90 },
  { type: "chair", x: 970, y: 130, facing: 270 },
  { type: "vending", x: 790, y: 10 },
  { type: "trash", x: 210, y: 20 },
  { type: "desk_cubicle", x: 100, y: 300, id: "desk_0" },
  { type: "chair", x: 120, y: 290, facing: 180 },
  { type: "computer", x: 120, y: 287 },
  { type: "keyboard", x: 130, y: 295 },
  { type: "mouse", x: 152, y: 295 },
  { type: "trash", x: 170, y: 290 },
  { type: "desk_cubicle", x: 300, y: 300, id: "desk_1" },
  { type: "chair", x: 320, y: 290, facing: 180 },
  { type: "computer", x: 320, y: 287 },
  { type: "keyboard", x: 330, y: 295 },
  { type: "mouse", x: 352, y: 295 },
  { type: "trash", x: 370, y: 290 },
  { type: "desk_cubicle", x: 500, y: 300, id: "desk_2" },
  { type: "chair", x: 520, y: 290, facing: 180 },
  { type: "computer", x: 520, y: 287 },
  { type: "keyboard", x: 530, y: 295 },
  { type: "mouse", x: 552, y: 295 },
  { type: "trash", x: 570, y: 290 },
  { type: "desk_cubicle", x: 700, y: 300, id: "desk_3" },
  { type: "chair", x: 720, y: 290, facing: 180 },
  { type: "computer", x: 720, y: 287 },
  { type: "keyboard", x: 730, y: 295 },
  { type: "mouse", x: 752, y: 295 },
  { type: "trash", x: 770, y: 290 },
  { type: "desk_cubicle", x: 100, y: 500, id: "desk_4" },
  { type: "computer", x: 120, y: 487 },
  { type: "keyboard", x: 130, y: 490 },
  { type: "mouse", x: 152, y: 495 },
  { type: "trash", x: 170, y: 490 },
  { type: "desk_cubicle", x: 300, y: 500, id: "desk_5" },
  { type: "chair", x: 310, y: 490, facing: 180 },
  { type: "computer", x: 320, y: 487 },
  { type: "keyboard", x: 330, y: 495 },
  { type: "mouse", x: 352, y: 495 },
  { type: "trash", x: 370, y: 500 },
  { type: "desk_cubicle", x: 500, y: 500, id: "desk_6" },
  { type: "chair", x: 520, y: 490, facing: 180 },
  { type: "computer", x: 520, y: 487 },
  { type: "keyboard", x: 530, y: 495 },
  { type: "mouse", x: 552, y: 495 },
  { type: "trash", x: 570, y: 490 },
  { type: "desk_cubicle", x: 700, y: 500, id: "desk_7" },
  { type: "chair", x: 720, y: 490, facing: 180 },
  { type: "computer", x: 720, y: 487 },
  { type: "keyboard", x: 730, y: 495 },
  { type: "mouse", x: 752, y: 495 },
  { type: "trash", x: 770, y: 490 },
  { type: "couch", x: 1000, y: 380, w: 100, h: 40, facing: 90 },
  { type: "couch", x: 390, y: 630, w: 100, h: 40 },
  { type: "table_rect", x: 980, y: 380, w: 60, h: 30, facing: 270 },
  { type: "pingpong", x: 950, y: 600, w: 100, h: 60 },
  { type: "beanbag", x: 1000, y: 330, color: "#e65100", facing: 90 },
  { type: "beanbag", x: 1000, y: 410, color: "#1565c0", facing: 90 },
  DEFAULT_ATM_MACHINE,
  DEFAULT_PHONE_BOOTH,
  DEFAULT_KANBAN_BOARD,
  { type: "whiteboard", x: 40, y: 200, w: 10, h: 60 },
  { type: "clock", x: 550, y: 5 },
  { type: "lamp", x: 430, y: 100 },
  { type: "lamp", x: 980, y: 390 },
  { type: "trash", x: 830, y: 20 },
  { type: "plant", x: 40, y: 40 },
  { type: "plant", x: 660, y: 30 },
  { type: "plant", x: 340, y: 700 },
  { type: "plant", x: 450, y: 450 },
  { type: "plant", x: 1090, y: 310 },
  { type: "plant", x: 1100, y: 490 },
  { type: "plant", x: 530, y: 700 },
  ...DEFAULT_SERVER_ROOM_ITEMS,
  ...DEFAULT_GYM_ITEMS,
  ...DEFAULT_QA_LAB_ITEMS,
  ...DEFAULT_ART_ROOM_ITEMS,
  DEFAULT_SMS_BOOTH,
  { type: "chair", x: 100, y: 200, facing: 180 },
];

// ---------------------------------------------------------------------------
// AI Hub layout preset (Phase 3): session pods carved into the default office.
// Keeps the walled rooms (server, gym, QA, art), kitchen, dining, and a break
// lounge intact; replaces the flat bullpen desks with pod clusters so a session
// and its subagents seat as one team. Desk `_uid`s are `aihub_<index>` (see
// materializeDefaults) — the pod descriptors below carry the same uids the seating
// allocator and desk routing key on.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Phase 9 interior remodel (Ken soak feedback #1). Building footprint is the
// local office: x 0..1792, y 0..712 (LOCAL_OFFICE_CANVAS_* = 1800×720). The
// nav grid only blocked the CANVAS edge (1800×1800), so agents escaped south of
// y720; AIHUB_PERIMETER_ITEMS below adds the missing south wall + a readable
// entrance door so wall-collision contains all movement (item 7 / item 9).
// ---------------------------------------------------------------------------

// KITCHEN — break-room appliances along the top-center north wall (item 3: restored).
const AIHUB_KITCHEN_ITEMS: FurnitureSeed[] = [
  { type: "fridge", x: 1050, y: 20, w: 40, h: 80 },
  { type: "stove", x: 920, y: 20 },
  { type: "cabinet", x: 980, y: 30, w: 40, h: 40 },
  { type: "microwave", x: 1030, y: 10, facing: 0 },
  { type: "sink", x: 970, y: 20 },
  { type: "dishwasher", x: 950, y: 20, w: 40, h: 40 },
  { type: "cabinet", x: 840, y: 30, w: 80, h: 40, elevation: 0 },
  { type: "coffee_machine", x: 880, y: 30, elevation: 0.56 },
  { type: "wall_cabinet", x: 960, y: 10, w: 80, h: 20, elevation: 0.9 },
  { type: "wall_cabinet", x: 880, y: 10, w: 80, h: 20, elevation: 0.9 },
];

// EATING AREA — break-room dining just south of the kitchen (item 4): two round tables + chairs.
// Round tables use TOP-LEFT coords with `r` → center = (x+r, y+r). Cluster ~x860-1075 / y145-260,
// clear of the kitchen (y<100), the pods (y>=290), the library room (x<=830) and the east hall.
const AIHUB_EATING_ITEMS: FurnitureSeed[] = [
  { type: "round_table", x: 858, y: 150, r: 34 },
  { type: "chair", x: 930, y: 172, facing: 270 },
  { type: "chair", x: 816, y: 172, facing: 90 },
  { type: "chair", x: 880, y: 106, facing: 180 },
  { type: "chair", x: 880, y: 222, facing: 0 },
  { type: "round_table", x: 858, y: 250, r: 34 },
  { type: "chair", x: 930, y: 272, facing: 270 },
  { type: "chair", x: 816, y: 272, facing: 90 },
  { type: "chair", x: 880, y: 320, facing: 0 },
];

// LOUNGE — coherent break lounge in the open floor east of the QA lab (item 2), arranged around a
// coffee table with the PING-PONG table pulled well clear of the QA east wall (QA_LAB_END_X=1534)
// so BOTH player slots (resolvePingPongTargets = x-40 and x+120) land in open floor (item 1).
// The jukebox lives in the lounge's north corner (item 3: relocated out of the break room).
const AIHUB_LOUNGE_ITEMS: FurnitureSeed[] = [
  // Seating hugs the west/east edges so a clear aisle stays open from the south corridor up to the
  // couches + ping-pong. The ping-pong table is pulled east of the QA wall (x1534) so both player
  // slots (resolvePingPongTargets = x1580 / x1740) are open floor (item 1).
  { type: "couch", x: 1545, y: 300, w: 40, h: 110, vertical: true, facing: 90 },
  { type: "table_rect", x: 1618, y: 336, w: 56, h: 30, facing: 0 },
  { type: "couch", x: 1712, y: 300, w: 40, h: 110, vertical: true, facing: 270 },
  { type: "beanbag", x: 1560, y: 200, color: "#e65100", facing: 135 },
  { type: "beanbag", x: 1720, y: 200, color: "#1565c0", facing: 225 },
  { type: "pingpong", x: 1620, y: 560, w: 100, h: 60 },
  { ...DEFAULT_JUKEBOX, x: 1560, y: 120, facing: 90 },
  { type: "plant", x: 1740, y: 120 },
  { type: "plant", x: 1758, y: 650 },
];

// LIBRARY / RESEARCH ROOM (item 6): the walled "middle office room". Bookshelves + books + reading
// tables in a walled room in the top-center, between the art room (x<=438) and the kitchen
// (x>=840). A door on the south wall opens into the pod bullpen (the pod1↔pod2 aisle). This is the
// research area — memory/graph/recall services map here (serviceMap), the reading walk-to target
// (LIBRARY_TARGET) and the "Library" camera-jump anchor (cameraZones) both point inside it.
// Interior ~x488-822 / y38-247.
const AIHUB_LIBRARY_ITEMS: FurnitureSeed[] = [
  // Room x480-810 / interior x488-802 / y30-255. Wide south door (x665-765) is aligned with the
  // pod1↔pod2 aisle (x660-790) so nav padding (±15) can't seal it — the reading spot stays walk-to.
  // Walled on three sides (N/E/W) with a wide OPEN south so the research room is a distinct "room"
  // that stays trivially walk-to from the bullpen (a full south wall + door kept getting sealed by
  // nav padding). Short south stubs frame the opening as a doorway without pinching it.
  { type: "wall", x: 480, y: 30, w: 330, h: WALL_THICKNESS }, // north
  { type: "wall", x: 480, y: 30, w: WALL_THICKNESS, h: 225 }, // west (y30-255)
  { type: "wall", x: 802, y: 30, w: WALL_THICKNESS, h: 225 }, // east
  { type: "wall", x: 480, y: 247, w: 70, h: WALL_THICKNESS }, // south stub (x480-550)
  { type: "wall", x: 740, y: 247, w: 70, h: WALL_THICKNESS }, // south stub (x740-810)
  { type: "bookshelf", x: 496, y: 40, w: 84, h: 30, facing: 180 },
  { type: "bookshelf", x: 592, y: 40, w: 84, h: 30, facing: 180 },
  { type: "bookshelf", x: 700, y: 40, w: 90, h: 30, facing: 180 },
  { type: "bookshelf", x: 496, y: 92, w: 84, h: 30, facing: 180 },
  { type: "table_rect", x: 520, y: 150, w: 90, h: 34, facing: 0 },
  { type: "chair", x: 535, y: 120, facing: 180 },
  { type: "chair", x: 585, y: 120, facing: 180 },
  { type: "beanbag", x: 715, y: 165, color: "#0f766e", facing: 225 },
  { type: "plant", x: 500, y: 210 },
  { type: "plant", x: 778, y: 60 },
];

// HUDDLE AREAS (item 5): round tables + chairs near the pods where collaborating agents gather.
// Centers exported as AIHUB_HUDDLE_TABLES so the payload-ready huddle choreography
// (computeHuddles in lib/aihub/collaboration.ts) can seat groups here in future.
export type AihubHuddleTable = { index: number; center: { x: number; y: number } };
// Huddle tables sit in open top-band pockets NEAR the pods (not in the narrow bullpen aisles,
// which are sole connections that a table would seal). Reachability is asserted in worldIntegrity.
const AIHUB_HUDDLE_CENTERS: { x: number; y: number }[] = [
  { x: 155, y: 230 }, // top-left, above pod 0 / beside the phone booth
  { x: 960, y: 245 }, // top-right, beside the eating area / above pod 2
];
const HUDDLE_TABLE_R = 34;
const buildHuddleItems = (): FurnitureSeed[] => {
  const items: FurnitureSeed[] = [];
  for (const { x: cx, y: cy } of AIHUB_HUDDLE_CENTERS) {
    // Round table centered on (cx,cy) — top-left = (cx-r, cy-r) with size r*2.
    items.push({ type: "round_table", x: cx - HUDDLE_TABLE_R, y: cy - HUDDLE_TABLE_R, r: HUDDLE_TABLE_R });
    // Four chairs around it (chair footprint 24×24 → offset the corner so the seat centers ~48px out).
    items.push({ type: "chair", x: cx + 42, y: cy - 12, facing: 270 });
    items.push({ type: "chair", x: cx - 66, y: cy - 12, facing: 90 });
    items.push({ type: "chair", x: cx - 12, y: cy - 66, facing: 180 });
    items.push({ type: "chair", x: cx - 12, y: cy + 42, facing: 0 });
  }
  return items;
};
const AIHUB_HUDDLE_ITEMS = buildHuddleItems();
export const AIHUB_HUDDLE_TABLES: AihubHuddleTable[] = AIHUB_HUDDLE_CENTERS.map(
  (center, index) => ({ index, center }),
);

// SOUTH PERIMETER WALL + ENTRANCE (item 7 containment / item 9 door). The building floor ends at
// y≈712 but the nav grid only blocked the canvas edge, so agents walked out the open south side.
// Furniture walls (blocksNavigation=true) close the south with a single readable door gap the
// spawn/leave anchors funnel through; DoorModel already swings it open on agent proximity.
//
// The east wing (gym+QA, y40-680) boxes off the far-east lounge; the only main↔lounge route runs
// south of the east wing, through the open hall (x1092-1126). A wall too high (near y710) would
// seal that back-corridor against the east-wing south wall (y680) once nav padding (±15) is
// applied. Placing the single south wall at y746 leaves a clear grid row (y700-725) so the
// corridor stays walkable, while still containing the whole building. The wall sits ~26px past the
// beige floor edge (y720); the environment south wall is gated to match the entrance gap.
const AIHUB_SOUTH_WALL_Y = 746;
const AIHUB_ENTRANCE_GAP_X1 = 770;
const AIHUB_ENTRANCE_GAP_X2 = 870;
const AIHUB_BUILDING_EAST_X = 1792;
const AIHUB_PERIMETER_ITEMS: FurnitureSeed[] = [
  { type: "wall", x: 0, y: AIHUB_SOUTH_WALL_Y, w: AIHUB_ENTRANCE_GAP_X1, h: WALL_THICKNESS },
  {
    type: "door",
    x: AIHUB_ENTRANCE_GAP_X1,
    y: AIHUB_SOUTH_WALL_Y,
    w: AIHUB_ENTRANCE_GAP_X2 - AIHUB_ENTRANCE_GAP_X1,
    h: DOOR_THICKNESS,
    facing: 0,
  },
  {
    type: "wall",
    x: AIHUB_ENTRANCE_GAP_X2,
    y: AIHUB_SOUTH_WALL_Y,
    w: AIHUB_BUILDING_EAST_X - AIHUB_ENTRANCE_GAP_X2,
    h: WALL_THICKNESS,
  },
];

// Canvas center of the entrance door gap — exported so the spawn/leave anchors and the environment
// south-wall gap stay in lockstep with the wall geometry above.
export const AIHUB_ENTRANCE_CENTER_X =
  (AIHUB_ENTRANCE_GAP_X1 + AIHUB_ENTRANCE_GAP_X2) / 2;
export const AIHUB_ENTRANCE_GAP_WIDTH =
  AIHUB_ENTRANCE_GAP_X2 - AIHUB_ENTRANCE_GAP_X1;
export const AIHUB_SOUTH_WALL_CANVAS_Y = AIHUB_SOUTH_WALL_Y;

const AIHUB_DECOR_ITEMS: FurnitureSeed[] = [
  DEFAULT_ATM_MACHINE, // (430,210) — satisfies ensureOfficeAtm
  { ...DEFAULT_PHONE_BOOTH, x: 1700, y: 600 }, // voice service anchor — quiet corner of the lounge
  DEFAULT_SMS_BOOTH, // (700,10) — satisfies ensureOfficeSmsBooth
  DEFAULT_KANBAN_BOARD, // (460,-60) — satisfies ensureOfficeKanbanBoard
  { type: "whiteboard", x: 240, y: 15, w: 10, h: 60 },
  { type: "clock", x: 900, y: 5 },
  { type: "vending", x: 620, y: 10 },
  { type: "trash", x: 210, y: 20 },
  { type: "trash", x: 1120, y: 20 },
  { type: "lamp", x: 430, y: 100 },
  { type: "plant", x: 230, y: 60 },
  { type: "plant", x: 660, y: 30 },
];

// Static (non-pod) items. Includes every room + appliance the office relies on so the
// ensureOffice* migrations (which only append MISSING items) are no-ops here and leave
// the deterministic `aihub_<index>` desk uids untouched. NOTE: the jukebox now lives in
// AIHUB_LOUNGE_ITEMS (relocated to the lounge corner), still satisfying ensureOfficeJukebox
// by type-presence.
const AIHUB_STATIC_ITEMS: FurnitureSeed[] = [
  ...DEFAULT_SERVER_ROOM_ITEMS,
  ...DEFAULT_GYM_ITEMS,
  ...DEFAULT_QA_LAB_ITEMS,
  ...DEFAULT_ART_ROOM_ITEMS,
  ...AIHUB_KITCHEN_ITEMS,
  ...AIHUB_EATING_ITEMS,
  ...AIHUB_LOUNGE_ITEMS,
  ...AIHUB_LIBRARY_ITEMS,
  ...AIHUB_HUDDLE_ITEMS,
  ...AIHUB_PERIMETER_ITEMS,
  ...AIHUB_DECOR_ITEMS,
];

// Pod geometry: a 2×2 cluster — lead (anchor) desk top-left, three member desks.
const AIHUB_DESK_PITCH_X = 150;
const AIHUB_DESK_PITCH_Y = 125;
// Phase 9: pods re-spaced so (a) wide bullpen↔top-band aisles stay open (top gaps ~130px between
// pods so the library room + kitchen stay reachable) and (b) no pod desk reaches the x1075-1100
// hall column that is the only main↔far-east-lounge route past the gym's SW corner.
const AIHUB_POD_ORIGINS: { x: number; y: number }[] = [
  { x: 100, y: 300 }, // leaves a clear west channel (x0-100) so the top-left band stays reachable
  { x: 410, y: 300 },
  { x: 790, y: 300 },
  { x: 270, y: 510 }, // clears the server-room door approach (door at x210, y630)
  { x: 540, y: 510 },
  { x: 810, y: 510 }, // SE desk ends ~x1060, leaving the x1075-1100 hall column clear
];

export type AihubPodLayout = {
  podIndex: number;
  // Pod center in canvas coords (rug placement + labels).
  center: { x: number; y: number };
  // Rug footprint in canvas units.
  size: { w: number; h: number };
  leadDeskUid: string;
  memberDeskUids: string[];
  deskUids: string[];
};

const buildAihubLayout = (): {
  furniture: FurnitureSeed[];
  pods: AihubPodLayout[];
  deskSlots: PodDeskSlot[];
} => {
  const furniture: FurnitureSeed[] = [];
  const pods: AihubPodLayout[] = [];
  const deskSlots: PodDeskSlot[] = [];
  // Push a seed and return its index — which becomes the `aihub_<index>` _uid, keeping
  // pod desk uids in lockstep with materializeDefaults regardless of interleaved dressing.
  const push = (seed: FurnitureSeed): number => {
    furniture.push(seed);
    return furniture.length - 1;
  };
  for (const seed of AIHUB_STATIC_ITEMS) push(seed);

  AIHUB_POD_ORIGINS.forEach((origin, podIndex) => {
    const seats: { dx: number; dy: number; seat: "lead" | "member" }[] = [
      { dx: 0, dy: 0, seat: "lead" },
      { dx: AIHUB_DESK_PITCH_X, dy: 0, seat: "member" },
      { dx: 0, dy: AIHUB_DESK_PITCH_Y, seat: "member" },
      { dx: AIHUB_DESK_PITCH_X, dy: AIHUB_DESK_PITCH_Y, seat: "member" },
    ];
    const deskUids: string[] = [];
    seats.forEach(({ dx, dy, seat }, seatIndex) => {
      const x = origin.x + dx;
      const y = origin.y + dy;
      const deskIndex = push({
        type: "desk_cubicle",
        x,
        y,
        id: `aihub_pod${podIndex}_${seat === "lead" ? "lead" : `m${seatIndex}`}`,
      });
      const deskUid = `aihub_${deskIndex}`;
      deskUids.push(deskUid);
      deskSlots.push({ deskUid, podIndex, seat });
      // Desk dressing (cosmetic; matches the default office desk).
      push({ type: "chair", x: x + 20, y: y - 10, facing: 180 });
      push({ type: "computer", x: x + 20, y: y - 13 });
      push({ type: "keyboard", x: x + 30, y: y - 5 });
      push({ type: "mouse", x: x + 52, y: y - 5 });
    });
    const spanW = AIHUB_DESK_PITCH_X + 100; // two desks wide
    const spanH = AIHUB_DESK_PITCH_Y + 55; // two desks tall
    pods.push({
      podIndex,
      center: { x: origin.x + spanW / 2, y: origin.y + spanH / 2 },
      size: { w: spanW + 40, h: spanH + 40 },
      leadDeskUid: deskUids[0],
      memberDeskUids: deskUids.slice(1),
      deskUids,
    });
  });

  return { furniture, pods, deskSlots };
};

const AIHUB_LAYOUT = buildAihubLayout();
const DEFAULT_AIHUB_FURNITURE: FurnitureSeed[] = AIHUB_LAYOUT.furniture;
export const AIHUB_POD_LAYOUTS: AihubPodLayout[] = AIHUB_LAYOUT.pods;
export const AIHUB_POD_DESK_SLOTS: PodDeskSlot[] = AIHUB_LAYOUT.deskSlots;

export const materializeDefaults = (
  preset: OfficeLayoutPreset = "office",
): FurnitureItem[] => {
  const seeds =
    preset === "lobby"
      ? DEFAULT_LOBBY_FURNITURE
      : preset === "aihub"
        ? DEFAULT_AIHUB_FURNITURE
        : DEFAULT_FURNITURE;
  return seeds.map((item, index) => ({
    ...item,
    _uid: `${preset}_${index}`,
  }));
};

export const isRetiredPingPongLamp = (item: FurnitureItem) =>
  item.type === "lamp" &&
  ((item.x === 870 && item.y === 470) || (item.x === 900 && item.y === 580));

const createFurnitureSignature = (item: FurnitureSeed | FurnitureItem) =>
  [
    item.type,
    item.x,
    item.y,
    item.w ?? "",
    item.h ?? "",
    item.r ?? "",
    item.facing ?? "",
    item.vertical ? 1 : 0,
    item.elevation ?? "",
  ].join(":");

const PREVIOUS_SERVER_ROOM_SIGNATURES = new Set(
  [
    ...PREVIOUS_SERVER_ROOM_ITEMS_BOTTOM_RIGHT,
    ...PREVIOUS_SERVER_ROOM_ITEMS_TOP_RIGHT,
  ].map(createFurnitureSignature),
);

const SERVER_ROOM_SIGNATURES = new Set(
  DEFAULT_SERVER_ROOM_ITEMS.map(createFurnitureSignature),
);

const LEGACY_GYM_ROOM_SIGNATURES = new Set(
  LEGACY_GYM_ROOM_ITEMS.map(createFurnitureSignature),
);
const PREVIOUS_GYM_ROOM_SIGNATURES = new Set(
  PREVIOUS_GYM_ROOM_ITEMS.map(createFurnitureSignature),
);
const GYM_ROOM_SIGNATURES = new Set(
  DEFAULT_GYM_ITEMS.map(createFurnitureSignature),
);
const LEGACY_QA_LAB_SIGNATURES = new Set(
  LEGACY_QA_LAB_ITEMS.map(createFurnitureSignature),
);
const PREVIOUS_QA_LAB_SIGNATURES = new Set(
  PREVIOUS_QA_LAB_ITEMS.map(createFurnitureSignature),
);
const QA_LAB_SIGNATURES = new Set(
  DEFAULT_QA_LAB_ITEMS.map(createFurnitureSignature),
);

const hasSignature = (items: FurnitureItem[], signatures: Set<string>) =>
  items.some((item) => signatures.has(createFurnitureSignature(item)));

const hasAllSignatures = (items: FurnitureItem[], signatures: Set<string>) => {
  const itemSignatures = new Set(items.map(createFurnitureSignature));
  return [...signatures].every((signature) => itemSignatures.has(signature));
};

const replaceBySignatureSet = (
  items: FurnitureItem[],
  signatures: Set<string>,
) => items.filter((item) => !signatures.has(createFurnitureSignature(item)));

export const ensureOfficePingPongTable = (
  items: FurnitureItem[],
): FurnitureItem[] => {
  if (items.some((item) => item.type === "pingpong")) return items;
  return [...items, { ...DEFAULT_PINGPONG_TABLE, _uid: nextUid() }];
};

export const ensureOfficeAtm = (items: FurnitureItem[]): FurnitureItem[] => {
  if (items.some((item) => item.type === "atm")) return items;
  if (hasAtmMigrationApplied()) return items;
  return [...items, { ...DEFAULT_ATM_MACHINE, _uid: nextUid() }];
};

export const ensureOfficeJukebox = (items: FurnitureItem[]): FurnitureItem[] => {
  if (items.some((item) => item.type === "jukebox")) return items;
  return [...items, { ...DEFAULT_JUKEBOX, _uid: nextUid() }];
};

export const ensureOfficeKanbanBoard = (items: FurnitureItem[]): FurnitureItem[] => {
  if (items.some((item) => item.type === "kanban_board")) return items;
  return [...items, { ...DEFAULT_KANBAN_BOARD, _uid: nextUid() }];
};

export const ensureOfficePhoneBooth = (
  items: FurnitureItem[],
): FurnitureItem[] => {
  let found = false;
  const nextItems = items.map((item) => {
    if (item.type === "phone_booth") {
      found = true;
      if (item.x === 980 && item.y === 560) {
        return { ...item, x: 1050, y: 190 };
      }
    }
    return item;
  });

  if (found) return nextItems;
  if (hasPhoneBoothMigrationApplied()) return nextItems;
  return [...nextItems, { ...DEFAULT_PHONE_BOOTH, _uid: nextUid() }];
};

export const ensureOfficeSmsBooth = (
  items: FurnitureItem[],
): FurnitureItem[] => {
  if (items.some((item) => item.type === "sms_booth")) return items;
  if (hasSmsBoothMigrationApplied()) return items;
  return [...items, { ...DEFAULT_SMS_BOOTH, _uid: nextUid() }];
};

export const ensureOfficeServerRoom = (
  items: FurnitureItem[],
): FurnitureItem[] => {
  const hasCurrentServerRoom = items.some((item) =>
    SERVER_ROOM_SIGNATURES.has(createFurnitureSignature(item)),
  );
  if (hasCurrentServerRoom) return items;

  const hasPreviousServerRoom = items.some((item) =>
    PREVIOUS_SERVER_ROOM_SIGNATURES.has(createFurnitureSignature(item)),
  );

  if (hasPreviousServerRoom) {
    const withoutPreviousServerRoom = items.filter(
      (item) =>
        !PREVIOUS_SERVER_ROOM_SIGNATURES.has(createFurnitureSignature(item)) &&
        item.type !== "server_rack" &&
        item.type !== "server_terminal",
    );
    const nextItems = [...withoutPreviousServerRoom];
    for (const diningItem of DEFAULT_DINING_ITEMS) {
      const hasDiningItem = nextItems.some(
        (item) =>
          createFurnitureSignature(item) ===
          createFurnitureSignature(diningItem),
      );
      if (!hasDiningItem) {
        nextItems.push({ ...diningItem, _uid: nextUid() });
      }
    }
    return [
      ...nextItems,
      ...DEFAULT_SERVER_ROOM_ITEMS.map((item) => ({
        ...item,
        _uid: nextUid(),
      })),
    ];
  }

  if (items.some((item) => item.type === "server_terminal")) return items;
  if (hasServerRoomMigrationApplied()) return items;
  return [
    ...items,
    ...DEFAULT_SERVER_ROOM_ITEMS.map((item) => ({ ...item, _uid: nextUid() })),
  ];
};

export const ensureOfficeGymRoom = (
  items: FurnitureItem[],
): FurnitureItem[] => {
  const hasCurrentGymRoom = hasSignature(items, GYM_ROOM_SIGNATURES);
  if (hasCurrentGymRoom) return items;

  const hasPreviousGymRoom = hasAllSignatures(
    items,
    PREVIOUS_GYM_ROOM_SIGNATURES,
  );
  if (hasPreviousGymRoom) {
    return [
      ...replaceBySignatureSet(items, PREVIOUS_GYM_ROOM_SIGNATURES),
      ...DEFAULT_GYM_ITEMS.map((item) => ({ ...item, _uid: nextUid() })),
    ];
  }

  const hasLegacyGymRoom = hasAllSignatures(items, LEGACY_GYM_ROOM_SIGNATURES);
  if (hasLegacyGymRoom) {
    return [
      ...replaceBySignatureSet(items, LEGACY_GYM_ROOM_SIGNATURES),
      ...DEFAULT_GYM_ITEMS.map((item) => ({ ...item, _uid: nextUid() })),
    ];
  }

  const hasGymEquipment = items.some((item) =>
    [
      "treadmill",
      "weight_bench",
      "dumbbell_rack",
      "exercise_bike",
      "punching_bag",
      "rowing_machine",
      "kettlebell_rack",
      "yoga_mat",
    ].includes(item.type),
  );
  if (hasGymEquipment) return items;
  if (hasGymRoomMigrationApplied()) return items;
  return [
    ...items,
    ...DEFAULT_GYM_ITEMS.map((item) => ({ ...item, _uid: nextUid() })),
  ];
};

export const ensureOfficeQaLab = (items: FurnitureItem[]): FurnitureItem[] => {
  const hasCurrentQaLab = hasSignature(items, QA_LAB_SIGNATURES);
  if (hasCurrentQaLab) return items;

  const hasPreviousQaLab = hasAllSignatures(items, PREVIOUS_QA_LAB_SIGNATURES);
  if (hasPreviousQaLab) {
    return [
      ...replaceBySignatureSet(items, PREVIOUS_QA_LAB_SIGNATURES),
      ...DEFAULT_QA_LAB_ITEMS.map((item) => ({ ...item, _uid: nextUid() })),
    ];
  }

  const hasLegacyQaLab = hasAllSignatures(items, LEGACY_QA_LAB_SIGNATURES);
  if (hasLegacyQaLab) {
    return [
      ...replaceBySignatureSet(items, LEGACY_QA_LAB_SIGNATURES),
      ...DEFAULT_QA_LAB_ITEMS.map((item) => ({ ...item, _uid: nextUid() })),
    ];
  }

  const hasQaFurniture = items.some((item) =>
    ["qa_terminal", "device_rack", "test_bench"].includes(item.type),
  );
  if (hasQaFurniture) return items;
  if (hasQaLabMigrationApplied()) return items;

  return [
    ...items,
    ...DEFAULT_QA_LAB_ITEMS.map((item) => ({ ...item, _uid: nextUid() })),
  ];
};
