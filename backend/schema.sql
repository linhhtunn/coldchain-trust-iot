CREATE TABLE IF NOT EXISTS cam_bien_data (
  id int NOT NULL AUTO_INCREMENT,
  topic varchar(255) NOT NULL,
  gia_tri varchar(255) NOT NULL,
  thoi_gian datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

-- Mỗi dòng là một lô dữ liệu đã ghi hash lên blockchain (id_lo trùng chỉ số lô trong contract)
CREATE TABLE IF NOT EXISTS lo_du_lieu (
  id_lo int NOT NULL,
  tu_id int NOT NULL,
  den_id int NOT NULL,
  ma_hash char(66) NOT NULL,
  tx_hash char(66) NOT NULL,
  thoi_gian datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_lo)
);
