extends Node3D

const GOVERNORATES := [
    "دمشق", "ريف دمشق", "القنيطرة", "درعا", "السويداء", "حمص", "طرطوس",
    "اللاذقية", "حماة", "إدلب", "حلب", "الرقة", "دير الزور", "الحسكة"
]

const AREAS := {
    "السويداء": ["ذيبين", "جبل العرب", "اللجاة الشرقية"],
    "ريف دمشق": ["جبل الشيخ", "وادي بردى", "القلمون"],
    "درعا": ["سهول حوران", "اللجاة"],
    "حمص": ["البادية", "تدمر", "ريف حمص"],
    "حماة": ["الغاب", "السلمية", "ريف حماة"],
    "اللاذقية": ["جبال الساحل", "ريف اللاذقية"],
    "طرطوس": ["ريف طرطوس", "الجبال الساحلية"],
    "حلب": ["ريف حلب", "السهوب الشمالية"],
    "إدلب": ["جبل الزاوية", "ريف إدلب"],
    "القنيطرة": ["مرتفعات الجولان", "ريف القنيطرة"],
    "الرقة": ["السهوب", "ضفاف الفرات"],
    "دير الزور": ["بادية دير الزور", "ضفاف الفرات"],
    "الحسكة": ["الجزيرة", "بادية الحسكة"],
    "دمشق": ["الغوطة", "محيط دمشق"]
}

var selected_governorate := "السويداء"
var selected_area := "ذيبين"
var player: CharacterBody3D
var dog: Node3D
var camera: Camera3D
var status_label: Label
var area_option: OptionButton
var move_vector := Vector2.ZERO
var dog_command := "توقف"
var tracking := 0.0

func _ready() -> void:
    _build_world()
    _build_ui()
    _update_area_options()
    _update_status()

func _process(delta: float) -> void:
    _move_player(delta)
    _update_dog(delta)
    _update_camera()
    tracking = min(100.0, tracking + delta * (0.7 if dog_command in ["ابحث", "تتبع"] else 0.08))
    _update_status()

func _build_world() -> void:
    var env := WorldEnvironment.new()
    var environment := Environment.new()
    environment.background_mode = Environment.BG_SKY
    var sky := Sky.new()
    var sky_material := ProceduralSkyMaterial.new()
    sky_material.sky_top_color = Color("#17253a")
    sky_material.sky_horizon_color = Color("#9eb7b1")
    sky_material.ground_bottom_color = Color("#172018")
    sky_material.ground_horizon_color = Color("#748278")
    sky.sky_material = sky_material
    environment.sky = sky
    environment.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
    environment.ambient_light_energy = 0.75
    environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
    env.environment = environment
    add_child(env)

    var sun := DirectionalLight3D.new()
    sun.rotation_degrees = Vector3(-52, -28, 0)
    sun.light_energy = 1.35
    sun.shadow_enabled = true
    add_child(sun)

    var ground := MeshInstance3D.new()
    var plane := PlaneMesh.new()
    plane.size = Vector2(180, 180)
    ground.mesh = plane
    ground.position.y = -0.05
    ground.material_override = _material(Color("#52633f"))
    add_child(ground)

    _create_terrain_details()
    _create_player()
    _create_dog()
    _create_camera()

func _create_terrain_details() -> void:
    for i in range(48):
        var tree := MeshInstance3D.new()
        var trunk := CylinderMesh.new()
        trunk.height = randf_range(1.4, 2.5)
        trunk.top_radius = 0.12
        trunk.bottom_radius = 0.22
        tree.mesh = trunk
        tree.position = Vector3(randf_range(-75, 75), trunk.height * 0.5, randf_range(-75, 75))
        tree.material_override = _material(Color("#3e3022"))
        add_child(tree)

        var crown := MeshInstance3D.new()
        var cone := CylinderMesh.new()
        cone.height = randf_range(2.0, 3.6)
        cone.top_radius = 0.0
        cone.bottom_radius = randf_range(0.8, 1.5)
        crown.mesh = cone
        crown.position = tree.position + Vector3(0, trunk.height * 0.55 + cone.height * 0.45, 0)
        crown.material_override = _material(Color("#29462b"))
        add_child(crown)

    for i in range(14):
        var rock := MeshInstance3D.new()
        var sphere := SphereMesh.new()
        sphere.radius = randf_range(0.5, 1.4)
        sphere.height = sphere.radius * 1.3
        rock.mesh = sphere
        rock.position = Vector3(randf_range(-70, 70), sphere.height * 0.25, randf_range(-70, 70))
        rock.scale = Vector3(1.5, 0.7, 1.1)
        rock.material_override = _material(Color("#5b5a50"))
        add_child(rock)

func _create_player() -> void:
    player = CharacterBody3D.new()
    player.name = "الصياد"
    var shape := CollisionShape3D.new()
    var capsule := CapsuleShape3D.new()
    capsule.radius = 0.38
    capsule.height = 1.8
    shape.shape = capsule
    player.add_child(shape)

    var visual := MeshInstance3D.new()
    var mesh := CapsuleMesh.new()
    mesh.radius = 0.38
    mesh.height = 1.8
    visual.mesh = mesh
    visual.material_override = _material(Color("#263b30"))
    player.add_child(visual)
    player.position = Vector3(0, 0.9, 8)
    add_child(player)

func _create_dog() -> void:
    dog = Node3D.new()
    dog.name = "كلب الصيد"
    var body := MeshInstance3D.new()
    var mesh := CapsuleMesh.new()
    mesh.radius = 0.28
    mesh.height = 0.9
    body.mesh = mesh
    body.rotation_degrees.z = 90
    body.material_override = _material(Color("#2a211c"))
    dog.add_child(body)
    dog.position = Vector3(1.3, 0.45, 6.7)
    add_child(dog)

func _create_camera() -> void:
    camera = Camera3D.new()
    camera.current = true
    camera.position = Vector3(0, 4.8, 12.0)
    add_child(camera)

func _move_player(delta: float) -> void:
    if not player:
        return
    var keyboard := Vector2.ZERO
    if Input.is_key_pressed(KEY_A): keyboard.x -= 1.0
    if Input.is_key_pressed(KEY_D): keyboard.x += 1.0
    if Input.is_key_pressed(KEY_W): keyboard.y -= 1.0
    if Input.is_key_pressed(KEY_S): keyboard.y += 1.0
    var input_dir := move_vector
    if keyboard.length() > 0.05:
        input_dir = keyboard.normalized()
    var direction := Vector3(input_dir.x, 0, input_dir.y)
    player.velocity = direction * 5.2
    player.move_and_slide()
    player.position.x = clamp(player.position.x, -86.0, 86.0)
    player.position.z = clamp(player.position.z, -86.0, 86.0)

func _update_dog(delta: float) -> void:
    if not dog or not player or dog_command == "توقف":
        return
    var target := player.global_position + Vector3(1.1, 0, 1.6)
    dog.global_position = dog.global_position.lerp(target, min(1.0, delta * (2.0 if dog_command == "تعال" else 1.4)))
    dog.global_position.y = 0.45

func _update_camera() -> void:
    if not camera or not player:
        return
    var target := player.global_position + Vector3(0, 1.4, 0)
    var desired := player.global_position + Vector3(0, 5.2, 10.5)
    camera.global_position = camera.global_position.lerp(desired, 0.08)
    camera.look_at(target, Vector3.UP)

func _build_ui() -> void:
    var layer := CanvasLayer.new()
    add_child(layer)

    var panel := PanelContainer.new()
    panel.position = Vector2(18, 18)
    panel.size = Vector2(360, 145)
    layer.add_child(panel)

    var box := VBoxContainer.new()
    panel.add_child(box)

    var title := Label.new()
    title.text = "رحلة صيد — Godot 4"
    title.add_theme_font_size_override("font_size", 22)
    box.add_child(title)

    var governorate := OptionButton.new()
    for item in GOVERNORATES:
        governorate.add_item(item)
    governorate.select(GOVERNORATES.find(selected_governorate))
    governorate.item_selected.connect(_on_governorate_selected)
    box.add_child(governorate)

    area_option = OptionButton.new()
    area_option.item_selected.connect(_on_area_selected)
    box.add_child(area_option)

    status_label = Label.new()
    box.add_child(status_label)

    var commands := HBoxContainer.new()
    commands.position = Vector2(18, 175)
    layer.add_child(commands)
    for command in ["ابحث", "تتبع", "ثبت", "توقف", "تعال"]:
        var button := Button.new()
        button.text = command
        button.custom_minimum_size = Vector2(78, 48)
        button.pressed.connect(_on_dog_command.bind(command))
        commands.add_child(button)

    var pad := GridContainer.new()
    pad.columns = 3
    pad.position = Vector2(18, 235)
    layer.add_child(pad)
    _add_move_button(pad, "", Vector2.ZERO)
    _add_move_button(pad, "▲", Vector2(0, -1))
    _add_move_button(pad, "", Vector2.ZERO)
    _add_move_button(pad, "◀", Vector2(-1, 0))
    _add_move_button(pad, "▼", Vector2(0, 1))
    _add_move_button(pad, "▶", Vector2(1, 0))

func _add_move_button(parent: Control, text_value: String, direction: Vector2) -> void:
    var button := Button.new()
    button.text = text_value
    button.custom_minimum_size = Vector2(64, 54)
    if text_value == "":
        button.disabled = true
    else:
        button.button_down.connect(_set_move.bind(direction))
        button.button_up.connect(_clear_move)
    parent.add_child(button)

func _set_move(direction: Vector2) -> void:
    move_vector = direction

func _clear_move() -> void:
    move_vector = Vector2.ZERO

func _on_governorate_selected(index: int) -> void:
    selected_governorate = GOVERNORATES[index]
    _update_area_options()
    _update_status()

func _update_area_options() -> void:
    if not area_option:
        return
    area_option.clear()
    var list: Array = AREAS.get(selected_governorate, ["الريف"])
    for area in list:
        area_option.add_item(area)
    selected_area = str(list[0])
    area_option.select(0)

func _on_area_selected(index: int) -> void:
    selected_area = area_option.get_item_text(index)
    _update_status()

func _on_dog_command(command: String) -> void:
    dog_command = command
    if command == "ابحث" or command == "تتبع":
        tracking = min(100.0, tracking + 4.0)
    elif command == "ثبت":
        tracking = min(100.0, tracking + 10.0)
    _update_status()

func _update_status() -> void:
    if not status_label:
        return
    status_label.text = "الموقع: %s — %s\nالكلب: %s | التتبع: %d%%" % [
        selected_governorate, selected_area, dog_command, int(tracking)
    ]

func _material(color: Color) -> StandardMaterial3D:
    var material := StandardMaterial3D.new()
    material.albedo_color = color
    material.roughness = 0.92
    return material
