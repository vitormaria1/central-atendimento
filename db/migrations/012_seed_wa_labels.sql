insert into wa_labels (id, name, color)
values
  ('7',  'AGUARDANDO RESPOSTA', '#D4A017'),
  ('12', 'CLIENTE ATIVO',       '#5E6AD2'),
  ('13', 'Não lidas',           '#FF8A80'),
  ('14', 'Favoritos',           '#FF8A80'),
  ('15', 'Grupos',              '#FF8A80'),
  ('16', 'DEVEDOR',             '#F44336'),
  ('17', 'PAUSA IA',            '#FFC107')
on conflict (id) do update set
  name = excluded.name,
  color = excluded.color,
  updated_at = now();

